import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { countInsightsSessions } from "../lib/count-insights-sessions";
import { isInsightsQueryEnabled } from "../lib/insights-query-enabled";
import { insightsQueryStubEvidenceUrl } from "../lib/insights-query-stub-evidence-url";
import {
  InsightsQueryParseError,
  isRangeTooWide,
  parseInsightsQuery,
} from "../lib/parse-insights-query";

export async function insightsQueryRoutes(app: FastifyInstance) {
  app.post(
    "/partners/me/insights-query",
    { preHandler: [app.authenticatePartner] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!isInsightsQueryEnabled()) {
        return reply.code(404).send({ error: "not_found" });
      }

      let parsed;
      try {
        parsed = parseInsightsQuery(req.body);
      } catch (err) {
        if (err instanceof InsightsQueryParseError) {
          return reply.code(400).send({
            error: "bad_request",
            message: err.message,
          });
        }
        throw err;
      }

      if (parsed.intent !== "count") {
        return reply.send({
          summary: "Only count queries are supported in this demo.",
          refusal: {
            code: "unsupported_intent",
            message: "Only count queries are supported in this demo.",
            suggestedIntents: ["count"],
          },
        });
      }

      const { from, to } = parsed.filters;
      if (!from || !to || isRangeTooWide(from, to)) {
        return reply.send({
          summary: "Date range must be at most 90 days and to must be after from.",
          refusal: {
            code: "range_too_wide",
            message:
              "Date range must be at most 90 days and to must be after from.",
          },
        });
      }

      const partner = (req as { partner: { id: string } }).partner;
      const totalCount = await countInsightsSessions(partner.id, parsed.filters);

      return reply.send({
        summary: `Found ${totalCount} matching completed sessions.`,
        totalCount,
        evidenceResultsUrl: insightsQueryStubEvidenceUrl(),
      });
    }
  );
}
