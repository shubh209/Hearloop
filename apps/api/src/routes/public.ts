// hearloop/apps/api/src/routes/public.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { db } from "../lib/db";
import { getUploadSignedUrl, buildStorageKey } from "../lib/storage";
import { enqueueValidate } from "../lib/queue";
import { logger } from "../lib/logger";
import {
  lookupPartnerByApiKey,
  isOriginAllowed,
  parseAllowedOrigins,
} from "../lib/lookup-api-key";
import {
  issueVersionedUploadGrant,
  UploadGrantError,
} from "../lib/upload-grants";
import {
  pinVersionedFinalize,
  FinalizePinError,
} from "../lib/finalize-pinning";

export async function publicRoutes(app: FastifyInstance) {
  // POST /public/sessions/create-token — exchange embed or secret key for session-create token
  app.post(
    "/public/sessions/create-token",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { apiKey?: string; embedKey?: string };
      const rawKey = body.embedKey ?? body.apiKey;

      if (!rawKey) {
        return reply.code(400).send({ error: "embedKey or apiKey required" });
      }

      try {
        const isEmbed = rawKey.startsWith("pk-live_");
        const keyRecord = await lookupPartnerByApiKey(rawKey, {
          allowedTypes: isEmbed ? ["public"] : ["secret", "public"],
        });

        if (!keyRecord) {
          return reply.code(401).send({ error: "Invalid API key" });
        }

        if (keyRecord.keyType === "public") {
          if (!keyRecord.allowedOrigins) {
            return reply.code(403).send({
              error: "embed_not_configured",
              message:
                "Add your website URL in Hearloop dashboard → Settings → Embed before using the widget.",
            });
          }

          const requestOrigin = req.headers.origin as string | undefined;
          if (!isOriginAllowed(keyRecord.allowedOrigins, requestOrigin)) {
            return reply.code(403).send({ error: "origin_not_allowed" });
          }

          if (requestOrigin) {
            reply.header("Access-Control-Allow-Origin", requestOrigin);
          }
        }

        // 2. Generate token (32 bytes = 64 hex chars)
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Store token in DB
        await db
          .insertInto("session_create_tokens")
          .values({
            partner_id: keyRecord.partnerId as string,
            token,
            expires_at: expiresAt,
            used_at: null,
          })
          .execute();

        // 4. Return token and TTL
        const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        return reply.code(200).send({
          sessionCreateToken: token,
          expiresIn,
        });
      } catch (err) {
        logger.error({ err, msg: "Error creating session token" });
        return reply.code(500).send({ error: "Failed to create token" });
      }
    }
  );

  // Helper: Validate session-create token
  async function validateSessionCreateToken(token: string) {
    // 1. Fetch token from DB
    const tokenRecord = await db
      .selectFrom("session_create_tokens")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst();

    if (!tokenRecord) {
      return { valid: false, partnerId: null };
    }

    // 2. Check expiry
    if (new Date() > tokenRecord.expires_at) {
      return { valid: false, partnerId: null };
    }

    // 3. Check if already used
    if (tokenRecord.used_at) {
      return { valid: false, partnerId: null };
    }

    // 4. Mark as used
    await db
      .updateTable("session_create_tokens")
      .set({ used_at: new Date() })
      .where("id", "=", tokenRecord.id)
      .execute();

    return { valid: true, partnerId: tokenRecord.partner_id };
  }

  // POST /public/sessions — create session using bearer token (session-create token) or API key
  app.post(
    "/public/sessions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Bearer token required" });
      }

      const token = authHeader.slice(7);

      // Validate session-create token
      const { valid, partnerId } = await validateSessionCreateToken(token);

      if (!valid || !partnerId) {
        return reply.code(401).send({ error: "Invalid or expired token" });
      }

      try {
        const body = req.body as {
          promptText?: string;
          maxDurationSec?: number;
          consentRequired?: boolean;
          consentText?: string;
          externalEventId?: string;
        };

        // Generate IDs and token
        const sessionId = randomUUID();
        const sessionToken = randomUUID();

        // Create session
        const now = new Date();
        await db
          .insertInto("sessions")
          .values({
            id: sessionId,
            partner_id: partnerId,
            public_token: sessionToken,
            status: "created",
            max_duration_sec: body.maxDurationSec ?? 5,
            metadata_json: body.promptText
              ? JSON.stringify({
                  promptText: body.promptText,
                  consentRequired: body.consentRequired ?? false,
                  consentText: body.consentText,
                  externalEventId: body.externalEventId,
                })
              : null,
            external_event_id: body.externalEventId,
            expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            created_at: now,
            updated_at: now,
          })
          .execute();

        return reply.code(201).send({
          sessionId,
          sessionToken,
        });
      } catch (err) {
        logger.error({ err, msg: "Error creating session with token" });
        return reply.code(500).send({ error: "Failed to create session" });
      }
    }
  );
  // GET /public/session/:token — resolve token → widget config
  app.get(
    "/public/session/:token",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.params as { token: string };

      const session = await db
        .selectFrom("sessions")
        .innerJoin("partners", "partners.id", "sessions.partner_id")
        .select([
          "sessions.id",
          "sessions.status",
          "sessions.max_duration_sec",
          "sessions.metadata_json",
          "sessions.expires_at",
          "partners.default_config_json",
          "partners.allowed_origins",
        ])
        .where("sessions.public_token", "=", token)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (session.status === "expired") {
        return reply.code(410).send({ error: "session_expired" });
      }

      if (["submitted", "processing", "completed"].includes(session.status)) {
        return reply.code(409).send({ error: "session_already_submitted" });
      }

      if (new Date() > new Date(session.expires_at)) {
        return reply.code(410).send({ error: "session_expired" });
      }

      const config = session.default_config_json
        ? JSON.parse(session.default_config_json)
        : {};

      return reply.send({
        sessionToken: token,
        status: session.status,
        maxDurationSec: session.max_duration_sec,
        promptText: config.promptText ?? null,
        consentRequired: config.consentRequired ?? false,
        consentText: config.consentText ?? null,
        // allowed_origins is stored comma-separated (see partner-me.ts /
        // partners.ts write paths) — parse it the same way every other
        // read site does, not as JSON.
        allowedOrigins: parseAllowedOrigins(session.allowed_origins),
        expiresAt: session.expires_at,
      });
    }
  );

  // POST /public/session/:token/open — move state to opened
  app.post(
    "/public/session/:token/open",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.params as { token: string };

      const session = await db
        .selectFrom("sessions")
        .select(["id", "status", "expires_at"])
        .where("public_token", "=", token)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (new Date() > new Date(session.expires_at)) {
        return reply.code(410).send({ error: "session_expired" });
      }

      // Only allow created → opened
      if (session.status !== "created") {
        return reply.send({ sessionId: session.id, status: session.status });
      }

      await db
        .updateTable("sessions")
        .set({ status: "opened", updated_at: new Date() })
        .where("id", "=", session.id)
        .execute();

      return reply.send({ sessionId: session.id, status: "opened" });
    }
  );

  // POST /public/session/:token/upload-url — get a signed S3 upload URL without Bearer auth
  app.post(
    "/public/session/:token/upload-url",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.params as { token: string };
      const { mimeType = "audio/webm" } = req.body as { mimeType?: string };

      const session = await db
        .selectFrom("sessions")
        .select([
          "id",
          "partner_id",
          "status",
          "expires_at",
          "upload_protocol",
        ])
        .where("public_token", "=", token)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (new Date() > new Date(session.expires_at)) {
        return reply.code(410).send({ error: "session_expired" });
      }

      if (!["opened", "recording"].includes(session.status)) {
        return reply.code(409).send({ error: "invalid_session_state" });
      }

      if (session.upload_protocol === "versioned-v1") {
        try {
          const result = await issueVersionedUploadGrant({
            partnerId: session.partner_id,
            sessionId: session.id,
            idempotencyKey: req.headers["idempotency-key"],
            body: req.body,
          });
          if (result.replayed) {
            reply.header("Idempotent-Replayed", "true");
          }
          return reply.code(201).send(result.response);
        } catch (error) {
          if (error instanceof UploadGrantError) {
            return reply
              .code(error.statusCode)
              .send({ error: error.errorCode });
          }
          throw error;
        }
      }

      const { uploadUrl, storageKey } = await getUploadSignedUrl(session.id, mimeType);

      return reply.send({ uploadUrl, storageKey, expiresIn: 900 });
    }
  );

  // POST /public/session/:token/finalize — submit recording and kick off processing
  app.post(
    "/public/session/:token/finalize",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.params as { token: string };
      const body = req.body as {
        storageKey: string;
        mimeType: string;
        durationMs?: number;
        sizeBytes?: number;
        sha256Hash?: string;
        consentGiven?: boolean;
        languageHint?: string;
        promptText?: string;
      };

      const session = await db
        .selectFrom("sessions")
        .select([
          "id",
          "partner_id",
          "status",
          "expires_at",
          "max_duration_sec",
          "upload_protocol",
        ])
        .where("public_token", "=", token)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (new Date() > new Date(session.expires_at)) {
        return reply.code(410).send({ error: "session_expired" });
      }

      // Idempotent: already submitted
      if (session.status === "submitted" || session.status === "processing") {
        return reply.send({ sessionId: session.id, status: session.status });
      }

      if (!["opened", "recording", "uploaded"].includes(session.status)) {
        return reply.code(409).send({ error: "invalid_session_state" });
      }

      if (session.upload_protocol === "versioned-v1") {
        try {
          const result = await pinVersionedFinalize({
            partnerId: session.partner_id,
            sessionId: session.id,
            maxDurationSec: session.max_duration_sec,
            idempotencyKey: req.headers["idempotency-key"],
            body: req.body,
          });
          if (result.replayed) {
            reply.header("Idempotent-Replayed", "true");
          }
          return reply.code(result.responseStatus).send(result.response);
        } catch (error) {
          if (error instanceof FinalizePinError) {
            return reply
              .code(error.statusCode)
              .send({ error: error.errorCode });
          }
          throw error;
        }
      }

      if (
        typeof body.mimeType !== "string" ||
        body.storageKey !== buildStorageKey(session.id, body.mimeType)
      ) {
        return reply.code(400).send({ error: "storage_key_mismatch" });
      }

      await db
        .insertInto("recordings")
        .values({
          id: randomUUID(),
          session_id: session.id,
          storage_key: body.storageKey,
          mime_type: body.mimeType,
          duration_ms: body.durationMs ?? null,
          size_bytes: body.sizeBytes ?? 0,
          sha256_hash: body.sha256Hash ?? "",
          created_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("session_id").doUpdateSet({
            storage_key: body.storageKey,
            mime_type: body.mimeType,
          })
        )
        .execute();

      await db
        .updateTable("sessions")
        .set({ status: "submitted", updated_at: new Date() })
        .where("id", "=", session.id)
        .execute();

      await enqueueValidate({
        sessionId: session.id,
        storageKey: body.storageKey,
        mimeType: body.mimeType,
        languageHint: body.languageHint,
        promptText: body.promptText,
        maxDurationSec: session.max_duration_sec,
      });

      return reply.send({ sessionId: session.id, status: "submitted" });
    }
  );

  // POST /public/capture/:linkToken/session — mint a fresh session from a durable
  // capture link (QR/SMS surface). The link's Target is attributed onto the new
  // session via metadata_json. Returns a session public_token the hosted capture
  // page consumes with the existing open/upload-url/finalize flow.
  app.post(
    "/public/capture/:linkToken/session",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { linkToken } = req.params as { linkToken: string };

      const link = await db
        .selectFrom("capture_links")
        .innerJoin("partners", "partners.id", "capture_links.partner_id")
        .select([
          "capture_links.partner_id",
          "capture_links.target_label",
          "capture_links.target_key",
          "capture_links.active",
          "partners.default_config_json",
        ])
        .where("capture_links.token", "=", linkToken)
        .executeTakeFirst();

      if (!link || !link.active) {
        return reply.code(404).send({ error: "capture_link_not_found" });
      }

      const config = link.default_config_json
        ? JSON.parse(link.default_config_json)
        : {};

      const sessionId = randomUUID();
      const sessionToken = randomUUID();
      const now = new Date();

      await db
        .insertInto("sessions")
        .values({
          id: sessionId,
          partner_id: link.partner_id,
          public_token: sessionToken,
          status: "created",
          max_duration_sec: config.maxDurationSec ?? 5,
          metadata_json: JSON.stringify({
            promptText: config.promptText,
            consentRequired: config.consentRequired ?? false,
            consentText: config.consentText,
            target: link.target_label
              ? {
                  label: link.target_label,
                  key: link.target_key,
                  source: "capture-link",
                }
              : null,
          }),
          external_event_id: null,
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          created_at: now,
          updated_at: now,
        })
        .execute();

      return reply.code(201).send({ sessionId, sessionToken });
    }
  );
}
