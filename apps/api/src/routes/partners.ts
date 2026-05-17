// hearloop/apps/api/src/routes/partners.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { randomUUID, createHash, randomBytes } from "crypto";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function partnerRoutes(app: FastifyInstance) {

  // POST /partners/register
  app.post(
    "/partners/register",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as {
        name: string;
        email: string;
        password: string;
        webhookUrl?: string;
      };

      if (!body.name || !body.email || !body.password) {
        return reply.code(400).send({ error: "name, email and password required" });
      }

      if (body.password.length < 6) {
        return reply.code(400).send({ error: "password must be at least 6 characters" });
      }

      const existing = await db
        .selectFrom("partners")
        .select("id")
        .where("email", "=", body.email)
        .executeTakeFirst();

      if (existing) {
        return reply.code(409).send({ error: "email_already_registered" });
      }

      const partnerId = randomUUID();
      const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);

      await db
        .insertInto("partners")
        .values({
          id: partnerId,
          name: body.name,
          email: body.email,
          password_hash: passwordHash,
          status: "active",
          webhook_url: body.webhookUrl ?? null,
          allowed_origins: null,
          default_config_json: JSON.stringify({
            promptText: "How was your experience today?",
            consentRequired: false,
          }),
          created_at: new Date(),
        })
        .execute();

      const rawKey = `sk-live_${randomBytes(24).toString("hex")}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12);

      await db
        .insertInto("api_keys")
        .values({
          id: randomUUID(),
          partner_id: partnerId,
          key_prefix: keyPrefix,
          key_hash: keyHash,
          last_used_at: null,
          revoked_at: null,
          created_at: new Date(),
        })
        .execute();

      return reply.code(201).send({
        partnerId,
        name: body.name,
        apiKey: rawKey,
        message: "Save your API key — it will not be shown again.",
      });
    }
  );

  // POST /partners/login
  app.post(
    "/partners/login",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { email: string; password: string };

      if (!body.email || !body.password) {
        return reply.code(400).send({ error: "email and password required" });
      }

      const partner = await db
      .selectFrom("partners")
      .innerJoin("api_keys", "api_keys.partner_id", "partners.id")
      .select([
        "partners.id",
        "partners.name",
        "partners.password_hash",
        "api_keys.key_prefix",
      ] as any)
      .where("partners.email", "=", body.email)
      .where("partners.status", "=", "active")
      .where("api_keys.revoked_at", "is", null)
      .executeTakeFirst() as any;

      if (!partner) return reply.code(401).send({ error: "invalid_credentials" });

      const valid = await bcrypt.compare(body.password, partner.password_hash);
      if (!valid) return reply.code(401).send({ error: "invalid_credentials" });

      return reply.send({
        partnerId: partner.id,
        name: partner.name,
        keyPrefix: partner.key_prefix,
      });
    }
  );

  // PATCH /partners/:id/settings — update webhook_url and/or allowed_origins
  app.patch(
    "/partners/:id/settings",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = (req as any).partner;

      if (partner.id !== id) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = req.body as {
        webhookUrl?: string | null;
        allowedOrigins?: string | null;
      };

      if (body.webhookUrl !== undefined) {
        if (body.webhookUrl !== null) {
          try {
            const parsed = new URL(body.webhookUrl);
            if (parsed.protocol !== "https:") {
              return reply.code(400).send({ error: "webhook_url must use HTTPS" });
            }
          } catch {
            return reply.code(400).send({ error: "webhook_url must be a valid URL" });
          }
        }
      }

      if (body.allowedOrigins !== undefined && body.allowedOrigins !== null) {
        // Validate each origin — must be a valid URL origin (scheme + host)
        const origins = body.allowedOrigins.split(",").map((o) => o.trim()).filter(Boolean);
        for (const origin of origins) {
          try {
            const parsed = new URL(origin);
            if (!parsed.origin || parsed.origin === "null") throw new Error("invalid");
          } catch {
            return reply.code(400).send({
              error: `invalid origin: "${origin}" — must be a full origin like https://example.com`,
            });
          }
        }
        // Normalise to comma-separated string of trimmed origins
        body.allowedOrigins = origins.join(",");
      }

      const updates: Record<string, unknown> = {};
      if (body.webhookUrl !== undefined) updates["webhook_url"] = body.webhookUrl;
      if (body.allowedOrigins !== undefined) updates["allowed_origins"] = body.allowedOrigins;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "no updatable fields provided" });
      }

      await db
        .updateTable("partners")
        .set(updates as any)
        .where("id", "=", id)
        .execute();

      return reply.send({ ok: true, updated: Object.keys(updates) });
    }
  );

  // GET /partners/:id/dashboard — unchanged
  app.get(
    "/partners/:id/dashboard",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = (req as any).partner;

      if (partner.id !== id) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const sessions = await db
        .selectFrom("sessions")
        .leftJoin("analyses", "analyses.session_id", "sessions.id")
        .leftJoin("recordings", "recordings.session_id", "sessions.id")
        .select([
          "sessions.id",
          "sessions.status",
          "sessions.external_event_id",
          "sessions.metadata_json",
          "sessions.created_at",
          "sessions.processing_started_at",
          "sessions.processing_completed_at",
          "analyses.transcript",
          "analyses.sentiment_label",
          "analyses.sentiment_score",
          "analyses.topics_json",
          "analyses.moderation_json",
          "analyses.detected_language",
          "analyses.model_used",
          "analyses.input_tokens",
          "analyses.output_tokens",
          "recordings.duration_ms",
          "recordings.mime_type",
        ] as any)
        .where("sessions.partner_id", "=", id)
        .orderBy("sessions.created_at", "desc")
        .limit(100)
        .execute() as any[];

      const completed = sessions.filter((s) => s.status === "completed");
      const total = sessions.length;

      const sentiments = completed.map((s) => s.sentiment_label).filter(Boolean);
      const positiveCount = sentiments.filter((s) => s === "positive").length;
      const negativeCount = sentiments.filter((s) => s === "negative").length;
      const neutralCount = sentiments.filter((s) => s === "neutral").length;

      const topicMap: Record<string, number> = {};
      completed.forEach((s) => {
        if (!s.topics_json) return;
        const topics = JSON.parse(s.topics_json) as string[];
        topics.forEach((t) => { topicMap[t] = (topicMap[t] ?? 0) + 1; });
      });

      const topics = Object.entries(topicMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({
          name,
          count,
          pct: Math.round((count / Math.max(completed.length, 1)) * 100),
        }));

      const urgentSessions = completed.filter((s) => {
        if (!s.moderation_json) return false;
        const mod = JSON.parse(s.moderation_json);
        return mod.urgency === "urgent";
      });

      const followUpSessions = completed.filter((s) => {
        if (!s.moderation_json) return false;
        const mod = JSON.parse(s.moderation_json);
        return mod.urgency === "follow_up";
      });

      // Metrics: latency, token usage, estimated cost
      const latencies = completed
        .filter((s) => s.processing_started_at && s.processing_completed_at)
        .map((s) => new Date(s.processing_completed_at).getTime() - new Date(s.processing_started_at).getTime());

      const avgLatencyMs = latencies.length > 0
        ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length)
        : null;

      const totalInputTokens = completed.reduce((sum: number, s: any) => sum + (s.input_tokens ?? 0), 0);
      const totalOutputTokens = completed.reduce((sum: number, s: any) => sum + (s.output_tokens ?? 0), 0);

      // Nova Lite pricing: $0.06/1M input tokens, $0.24/1M output tokens
      const estimatedCostUsd = parseFloat(
        ((totalInputTokens * 0.00000006) + (totalOutputTokens * 0.00000024)).toFixed(6)
      );

      const modelBreakdown = completed.reduce(
        (acc: Record<string, number>, s: any) => {
          const key = s.model_used ?? "none";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const formattedSessions = sessions.map((s) => {
        let moderation: any = {};
        try { moderation = s.moderation_json ? JSON.parse(s.moderation_json) : {}; } catch {}
        let topics: string[] = [];
        try { topics = s.topics_json ? JSON.parse(s.topics_json) : []; } catch {}

        return {
          id: s.id,
          status: s.status,
          externalEventId: s.external_event_id,
          createdAt: s.created_at,
          transcript: s.transcript,
          sentiment: s.sentiment_label,
          sentimentScore: s.sentiment_score,
          topics,
          urgency: moderation.urgency ?? "none",
          summary: moderation.summary ?? "",
          qualityFlags: moderation.qualityFlags ?? [],
          language: s.detected_language,
          durationMs: s.duration_ms,
        };
      });

      return reply.send({
        stats: {
          total,
          completed: completed.length,
          urgent: urgentSessions.length,
          followUp: followUpSessions.length,
          sentiment: {
            positive: positiveCount,
            negative: negativeCount,
            neutral: neutralCount,
            positiveRate: Math.round((positiveCount / Math.max(sentiments.length, 1)) * 100),
          },
          completionRate: Math.round((completed.length / Math.max(total, 1)) * 100),
          metrics: {
            avgLatencyMs,
            totalInputTokens,
            totalOutputTokens,
            estimatedCostUsd,
            modelBreakdown,
          },
        },
        topics,
        sessions: formattedSessions,
      });
    }
  );
}