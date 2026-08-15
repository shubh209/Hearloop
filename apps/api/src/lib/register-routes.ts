import type { FastifyInstance } from "fastify";
import { captureLinkRoutes } from "../routes/capture-links";
import { healthRoutes } from "../routes/health";
import { partnerMeRoutes } from "../routes/partner-me";
import { partnerRoutes } from "../routes/partners";
import { publicRoutes } from "../routes/public";
import { sessionRoutes } from "../routes/sessions";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(sessionRoutes, { prefix: "/v1" });
  await app.register(publicRoutes, { prefix: "/v1" });
  await app.register(partnerRoutes, { prefix: "/v1" });
  await app.register(partnerMeRoutes, { prefix: "/v1" });
  await app.register(captureLinkRoutes, { prefix: "/v1" });
  await app.register(healthRoutes);
}
