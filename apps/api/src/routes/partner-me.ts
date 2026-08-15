// hearloop/apps/api/src/routes/partner-me.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { createApiKeyForPartner } from "../lib/create-api-key";
import { buildDashboardPayload } from "./partner-dashboard";
import {
  PartnerSettingsValidationError,
  validatePartnerSettingsInput,
} from "../lib/partner-settings";

export async function partnerMeRoutes(app: FastifyInstance) {
  const auth = [app.authenticatePartner];

  app.get(
    "/partners/me",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const embedKey = await db
        .selectFrom("api_keys")
        .select(["key_prefix"])
        .where("partner_id", "=", partner.id)
        .where("type", "=", "public")
        .where("revoked_at", "is", null)
        .executeTakeFirst();

      const secretKey = await db
        .selectFrom("api_keys")
        .select(["key_prefix"])
        .where("partner_id", "=", partner.id)
        .where("type", "=", "secret")
        .where("revoked_at", "is", null)
        .executeTakeFirst();

      return reply.send({
        partnerId: partner.id,
        name: partner.name,
        businessContext: partner.businessContext,
        allowedOrigins: partner.allowedOrigins,
        webhookUrl: partner.webhookUrl,
        embedKeyPrefix: embedKey?.key_prefix ?? null,
        hasSecretKey: !!secretKey,
        secretKeyPrefix: secretKey?.key_prefix ?? null,
      });
    }
  );

  app.get(
    "/partners/me/dashboard",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      return reply.send(await buildDashboardPayload(partner.id));
    }
  );

  app.patch(
    "/partners/me/settings",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
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
      if (parsed.businessContextSource !== undefined) {
        updates["business_context_source"] = parsed.businessContextSource;
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "no updatable fields provided" });
      }

      await db
        .updateTable("partners")
        .set(updates as any)
        .where("id", "=", partner.id)
        .execute();

      return reply.send({ ok: true, updated: Object.keys(updates) });
    }
  );

  app.post(
    "/partners/me/embed/regenerate",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;

      await db
        .updateTable("api_keys")
        .set({ revoked_at: new Date() })
        .where("partner_id", "=", partner.id)
        .where("type", "=", "public")
        .where("revoked_at", "is", null)
        .execute();

      const { rawKey, keyPrefix } = await createApiKeyForPartner(
        partner.id,
        "public"
      );

      return reply.send({
        embedKey: rawKey,
        embedKeyPrefix: keyPrefix,
        message: "Save your widget embed key — it will not be shown again.",
      });
    }
  );

  app.post(
    "/partners/me/secret-keys",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const { rawKey, keyPrefix } = await createApiKeyForPartner(
        partner.id,
        "secret"
      );

      return reply.send({
        secretKey: rawKey,
        keyPrefix,
        message: "Save your secret API key — it will not be shown again.",
      });
    }
  );
}
