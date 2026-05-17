// hearloop/apps/api/src/routes/public.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { db } from "../lib/db";
import { getUploadSignedUrl } from "../lib/storage";
import { enqueueValidate } from "../lib/queue";
import { logger } from "../lib/logger";

export async function publicRoutes(app: FastifyInstance) {
  // POST /public/sessions/create-token — create short-lived token for session creation
  app.post<{ Body: { apiKey: string } }>(
    "/public/sessions/create-token",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { apiKey } = req.body;

      if (!apiKey) {
        return reply.code(400).send({ error: "apiKey required" });
      }

      try {
        // 1. Find partner by API key (key is hashed as SHA-256)
        const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
        const partner = await db
          .selectFrom("partners")
          .selectAll()
          .where("id", "=", keyHash)
          .executeTakeFirst();

        if (!partner) {
          return reply.code(401).send({ error: "Invalid API key" });
        }

        // 2. Generate token (32 bytes = 64 hex chars)
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Store token in DB
        await db
          .insertInto("session_create_tokens")
          .values({
            partner_id: partner.id,
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
  app.post<{
    Body: {
      promptText?: string;
      maxDurationSec?: number;
      consentRequired?: boolean;
      consentText?: string;
      externalEventId?: string;
    };
  }>(
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
            max_duration_sec: req.body.maxDurationSec ?? 5,
            metadata_json: req.body.promptText
              ? JSON.stringify({
                  promptText: req.body.promptText,
                  consentRequired: req.body.consentRequired ?? false,
                  consentText: req.body.consentText,
                  externalEventId: req.body.externalEventId,
                })
              : null,
            external_event_id: req.body.externalEventId,
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
        allowedOrigins: session.allowed_origins
          ? JSON.parse(session.allowed_origins)
          : [],
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
        .select(["id", "status", "expires_at"])
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
        .select(["id", "partner_id", "status", "expires_at", "max_duration_sec"])
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
}