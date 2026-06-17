// hearloop/apps/api/src/routes/partners.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { createApiKeyForPartner } from "../lib/create-api-key";
import { signPartnerSession } from "../lib/partner-session";
import { buildDashboardPayload } from "./partner-dashboard";

const SALT_ROUNDS = 12;

const AUTOMOTIVE_TEMPLATE =
  "Quick-service automotive shop. Common visits: oil change, tire rotation, brake service. " +
  "Walk-in and appointment customers. Visits usually 45–90 minutes. " +
  "We care about wait time, pricing vs quote, staff attitude, and bay cleanliness.";

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
        businessContext?: string | null;
        industryTemplate?: string | null;
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

      let businessContext: string | null = null;
      if (body.businessContext?.trim()) {
        businessContext = body.businessContext.trim().slice(0, 500);
      } else if (body.industryTemplate === "automotive") {
        businessContext = AUTOMOTIVE_TEMPLATE;
      }

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
          business_context: businessContext,
          default_config_json: JSON.stringify({
            promptText: "How was your experience today?",
            consentRequired: false,
          }),
          created_at: new Date(),
        })
        .execute();

      const { keyPrefix: embedKeyPrefix } = await createApiKeyForPartner(
        partnerId,
        "public"
      );

      const sessionToken = signPartnerSession(partnerId);

      return reply.code(201).send({
        partnerId,
        name: body.name,
        sessionToken,
        embedKeyPrefix,
        hasBusinessContext: !!businessContext,
        message:
          "Account created. Add your website URL and copy your widget key under Settings → Embed.",
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
        .select(["id", "name", "password_hash", "status"])
        .where("email", "=", body.email)
        .where("status", "=", "active")
        .executeTakeFirst();

      if (!partner?.password_hash) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      const valid = await bcrypt.compare(body.password, partner.password_hash);
      if (!valid) return reply.code(401).send({ error: "invalid_credentials" });

      const sessionToken = signPartnerSession(partner.id);

      return reply.send({
        partnerId: partner.id,
        name: partner.name,
        sessionToken,
      });
    }
  );

  // PATCH /partners/:id/settings
  app.patch(
    "/partners/:id/settings",
    { preHandler: [app.authenticatePartner] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = (req as any).partner;

      if (partner.id !== id) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = req.body as {
        webhookUrl?: string | null;
        allowedOrigins?: string | null;
        businessContext?: string | null;
      };

      if (body.webhookUrl !== undefined && body.webhookUrl !== null) {
        try {
          const parsed = new URL(body.webhookUrl);
          if (parsed.protocol !== "https:") {
            return reply.code(400).send({ error: "webhook_url must use HTTPS" });
          }
        } catch {
          return reply.code(400).send({ error: "webhook_url must be a valid URL" });
        }
      }

      if (body.allowedOrigins !== undefined && body.allowedOrigins !== null) {
        const origins = body.allowedOrigins
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);
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
        body.allowedOrigins = origins.join(",");
      }

      const updates: Record<string, unknown> = {};
      if (body.webhookUrl !== undefined) updates["webhook_url"] = body.webhookUrl;
      if (body.allowedOrigins !== undefined) {
        updates["allowed_origins"] = body.allowedOrigins;
      }
      if (body.businessContext !== undefined) {
        updates["business_context"] = body.businessContext
          ? body.businessContext.trim().slice(0, 500)
          : null;
      }

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

  // GET /partners/:id/dashboard — legacy path; prefer /partners/me/dashboard
  app.get(
    "/partners/:id/dashboard",
    { preHandler: [app.authenticatePartner] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const partner = (req as any).partner;

      if (partner.id !== id) {
        return reply.code(403).send({ error: "forbidden" });
      }

      return reply.send(await buildDashboardPayload(id));
    }
  );
}
