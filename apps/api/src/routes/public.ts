// hearloop/apps/api/src/routes/public.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { db } from "../lib/db";
import { getUploadSignedUrl } from "../lib/storage";
import { enqueueValidate } from "../lib/queue";

export async function publicRoutes(app: FastifyInstance) {
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