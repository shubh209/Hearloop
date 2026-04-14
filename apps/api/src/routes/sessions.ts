// hearloop/apps/api/src/routes/sessions.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { getUploadSignedUrl, deleteAudio } from "../lib/storage";
import { enqueueTranscribe, enqueueExpireSession } from "../lib/queue";
import { randomUUID } from "crypto";

export async function sessionRoutes(app: FastifyInstance) {
  // POST /sessions — create a new feedback session
  app.post(
    "/sessions",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = req.partner;
      const body = req.body as {
        externalEventId?: string;
        externalUserId?: string;
        maxDurationSec?: number;
        languageHint?: string;
        promptText?: string;
        consentRequired?: boolean;
        consentText?: string;
        metadata?: Record<string, unknown>;
      };

      const sessionId = randomUUID();
      const publicToken = randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

      await db
        .insertInto("sessions")
        .values({
          id: sessionId,
          partner_id: partner.id,
          public_token: publicToken,
          status: "created",
          failure_reason: null,
          external_event_id: body.externalEventId ?? null,
          max_duration_sec: body.maxDurationSec ?? 5,
          metadata_json: body.metadata
            ? JSON.stringify(body.metadata)
            : null,
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      // Schedule expiry job
      await enqueueExpireSession(
        sessionId,
        expiresAt.getTime() - Date.now()
      );

      const captureUrl = `${process.env.APP_URL}/capture/${publicToken}`;

      return reply.code(201).send({
        sessionId,
        sessionToken: publicToken,
        captureUrl,
        expiresAt: expiresAt.toISOString(),
      });
    }
  );

  // GET /sessions/:id — fetch session status
  app.get(
    "/sessions/:id",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = req.partner;

      const session = await db
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      return reply.send({
        sessionId: session.id,
        status: session.status,
        externalEventId: session.external_event_id,
        metadata: session.metadata_json
          ? JSON.parse(session.metadata_json)
          : null,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
      });
    }
  );

  // GET /sessions/:id/result — fetch completed analysis
  app.get(
    "/sessions/:id/result",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = req.partner;

      const session = await db
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (session.status !== "completed") {
        return reply.code(202).send({
          sessionId: id,
          status: session.status,
          message: "processing_not_complete",
        });
      }

      const [recording, analysis] = await Promise.all([
        db
          .selectFrom("recordings")
          .selectAll()
          .where("session_id", "=", id)
          .executeTakeFirst(),
        db
          .selectFrom("analyses")
          .selectAll()
          .where("session_id", "=", id)
          .executeTakeFirst(),
      ]);

      const moderation = analysis?.moderation_json
        ? JSON.parse(analysis.moderation_json)
        : {};

      return reply.send({
        sessionId: id,
        status: "completed",
        recording: recording
          ? {
              mimeType: recording.mime_type,
              durationMs: recording.duration_ms,
              sizeBytes: recording.size_bytes,
            }
          : null,
        analysis: analysis
          ? {
              transcript: analysis.transcript,
              detectedLanguage: analysis.detected_language,
              sentiment: analysis.sentiment_label,
              sentimentScore: analysis.sentiment_score,
              topics: analysis.topics_json
                ? JSON.parse(analysis.topics_json)
                : [],
              urgency: moderation.urgency ?? "none",
              summary: moderation.summary ?? "",
              qualityFlags: moderation.qualityFlags ?? [],
              moderationFlags: moderation.moderationFlags ?? [],
            }
          : null,
      });
    }
  );

  // POST /sessions/:id/upload-url — get signed upload URL
  app.post(
    "/sessions/:id/upload-url",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = req.partner;
      const { mimeType = "audio/webm" } = req.body as {
        mimeType?: string;
      };

      const session = await db
        .selectFrom("sessions")
        .select(["id", "status", "partner_id"])
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (!["opened", "recording"].includes(session.status)) {
        return reply.code(409).send({ error: "invalid_session_state" });
      }

      const { uploadUrl, storageKey } = await getUploadSignedUrl(
        id,
        mimeType
      );

      return reply.send({ uploadUrl, storageKey, expiresIn: 900 });
    }
  );

  // POST /sessions/:id/finalize — mark submitted, kick off processing
  app.post(
    "/sessions/:id/finalize",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = req.partner;
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
        .selectAll()
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      if (session.status === "submitted" || session.status === "processing") {
        // Idempotent — already submitted
        return reply.send({ sessionId: id, status: session.status });
      }

      if (!["uploaded", "recording"].includes(session.status)) {
        return reply.code(409).send({ error: "invalid_session_state" });
      }

      // Upsert recording row
      await db
        .insertInto("recordings")
        .values({
          id: randomUUID(),
          session_id: id,
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

      // Transition to submitted
      await db
        .updateTable("sessions")
        .set({ status: "submitted", updated_at: new Date() })
        .where("id", "=", id)
        .execute();

      // Kick off processing pipeline
      await enqueueTranscribe({
        sessionId: id,
        storageKey: body.storageKey,
        mimeType: body.mimeType,
        languageHint: body.languageHint,
        promptText: body.promptText,
      });

      return reply.send({ sessionId: id, status: "submitted" });
    }
  );

  // DELETE /sessions/:id — delete session + audio (privacy)
  app.delete(
    "/sessions/:id",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = req.partner;

      const session = await db
        .selectFrom("sessions")
        .select(["id", "partner_id"])
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .executeTakeFirst();

      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      const recording = await db
        .selectFrom("recordings")
        .select("storage_key")
        .where("session_id", "=", id)
        .executeTakeFirst();

      if (recording) {
        await deleteAudio(recording.storage_key);
      }

      await db
        .deleteFrom("analyses")
        .where("session_id", "=", id)
        .execute();

      await db
        .deleteFrom("recordings")
        .where("session_id", "=", id)
        .execute();

      await db
        .deleteFrom("sessions")
        .where("id", "=", id)
        .execute();

      return reply.code(204).send();
    }
  );
}