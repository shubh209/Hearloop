import type { FastifyInstance } from "fastify";
import { captureLinkRoutes } from "./capture-links";
import { healthRoutes } from "./health";
import { partnerMeRoutes } from "./partner-me";
import { partnerRoutes } from "./partners";
import { publicRoutes } from "./public";
import { sessionRoutes } from "./sessions";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(sessionRoutes, { prefix: "/v1" });
  await app.register(publicRoutes, { prefix: "/v1" });
  await app.register(partnerRoutes, { prefix: "/v1" });
  await app.register(partnerMeRoutes, { prefix: "/v1" });
  await app.register(captureLinkRoutes, { prefix: "/v1" });
  await app.register(healthRoutes);
}
