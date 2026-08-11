// hearloop/apps/api/src/routes/partners.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { createApiKeyForPartner } from "../lib/create-api-key";
import { signPartnerSession } from "../lib/partner-session";
import { buildDashboardPayload } from "./partner-dashboard";
import {
  PartnerSettingsValidationError,
  validatePartnerSettingsInput,
} from "../lib/partner-settings";

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

      if (body.password.length < 10) {
        return reply.code(400).send({ error: "password must be at least 10 characters" });
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

      let parsed;
      try {
        parsed = validatePartnerSettingsInput(req.body ?? {});
      } catch (err) {
        if (err instanceof PartnerSettingsValidationError) {
          return reply.code(400).send({ error: err.error, message: err.message });
        }
        throw err;
      }

      const updates: Record<string, unknown> = {};
      if (parsed.webhookUrl !== undefined) updates["webhook_url"] = parsed.webhookUrl;
      if (parsed.allowedOrigins !== undefined) {
        updates["allowed_origins"] = parsed.allowedOrigins;
      }
      if (parsed.businessContext !== undefined) {
        updates["business_context"] = parsed.businessContext;
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
