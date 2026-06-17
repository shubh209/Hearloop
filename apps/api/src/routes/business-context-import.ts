// hearloop/apps/api/src/routes/business-context-import.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { assertPublicHttpsUrl, SsrfBlockedError } from "../lib/assert-public-https-url";
import { assertImportRateLimit, ImportRateLimitedError } from "../lib/import-rate-limit";
import {
  getImportJobStatus,
  partnerHasActiveImport,
} from "../lib/import-job-status";
import { enqueueImportBusinessContext } from "../lib/queue";
import { isValidUuid } from "../lib/validate-uuid";

export async function businessContextImportRoutes(app: FastifyInstance) {
  const auth = [app.authenticatePartner];

  app.post(
    "/partners/me/business-context/import",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const body = req.body as { websiteUrl?: string };

      if (!body?.websiteUrl?.trim()) {
        return reply.code(400).send({ error: "website_url_required" });
      }

      const websiteUrl = body.websiteUrl.trim();

      try {
        assertPublicHttpsUrl(websiteUrl);
      } catch (err) {
        if (err instanceof SsrfBlockedError) {
          return reply.code(400).send({ error: err.code, message: err.message });
        }
        throw err;
      }

      try {
        await assertImportRateLimit(partner.id);
      } catch (err) {
        if (err instanceof ImportRateLimitedError) {
          return reply.code(429).send({
            error: err.code,
            message: "Maximum 3 imports per hour. Try again later.",
          });
        }
        throw err;
      }

      if (await partnerHasActiveImport(partner.id)) {
        return reply.code(409).send({
          error: "import_in_progress",
          message: "An import is already running. Wait for it to finish.",
        });
      }

      const importId = await enqueueImportBusinessContext({
        partnerId: partner.id,
        websiteUrl,
      });

      return reply.code(202).send({ importId, status: "pending" });
    }
  );

  app.get(
    "/partners/me/business-context/import/:importId",
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const partner = (req as any).partner;
      const { importId } = req.params as { importId: string };

      if (!isValidUuid(importId)) {
        return reply.code(400).send({ error: "invalid_import_id" });
      }

      const status = await getImportJobStatus(importId, partner.id);
      if (!status) {
        return reply.code(404).send({ error: "import_not_found" });
      }

      return reply.send(status);
    }
  );
}
