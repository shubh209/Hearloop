// hearloop/apps/api/src/routes/capture-links.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID, randomBytes } from "crypto";
import { db } from "../lib/db";
import { normalizeTargetKey } from "../lib/target-key";

// Partner-facing management of durable capture links (the in-person QR/SMS surface).
// Minting a session from a link is public and lives in routes/public.ts.
export async function captureLinkRoutes(app: FastifyInstance) {
  const auth = [app.authenticatePartner];

  // POST /partners/me/capture-links — create a link, optionally bound to a Target
  app.post(
    "/partners/me/capture-links",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const body = (req.body as { targetLabel?: string }) ?? {};
      const label = body.targetLabel?.trim().slice(0, 120) || null;

      const id = randomUUID();
      const token = randomBytes(16).toString("hex"); // 32 hex chars

      await db
        .insertInto("capture_links")
        .values({
          id,
          partner_id: partner.id,
          token,
          target_label: label,
          target_key: label ? normalizeTargetKey(label) : null,
          active: true,
          created_at: new Date(),
        })
        .execute();

      return reply.code(201).send({
        id,
        token,
        targetLabel: label,
        path: `/c/${token}`,
        active: true,
      });
    }
  );

  // GET /partners/me/capture-links — list active links for the partner
  app.get(
    "/partners/me/capture-links",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;

      const rows = await db
        .selectFrom("capture_links")
        .select([
          "id",
          "token",
          "target_label",
          "target_key",
          "created_at",
        ])
        .where("partner_id", "=", partner.id)
        .where("active", "=", true)
        .orderBy("created_at", "desc")
        .execute();

      return reply.send({
        links: rows.map((r) => ({
          id: r.id,
          token: r.token,
          targetLabel: r.target_label,
          targetKey: r.target_key,
          path: `/c/${r.token}`,
          createdAt: r.created_at,
        })),
      });
    }
  );

  // DELETE /partners/me/capture-links/:id — deactivate (soft delete; preserves history)
  app.delete(
    "/partners/me/capture-links/:id",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const { id } = req.params as { id: string };

      await db
        .updateTable("capture_links")
        .set({ active: false })
        .where("id", "=", id)
        .where("partner_id", "=", partner.id)
        .execute();

      return reply.send({ ok: true });
    }
  );
}
