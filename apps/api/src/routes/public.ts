// hearloop/apps/api/src/routes/public.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";

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
}