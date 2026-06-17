// hearloop/apps/api/src/routes/partner-me.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../lib/db";
import { createApiKeyForPartner } from "../lib/create-api-key";
import { buildDashboardPayload } from "./partner-dashboard";

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
            return reply
              .code(400)
              .send({
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
