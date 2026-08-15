import Fastify from "fastify";
import { registerRoutes } from "../register";

describe("registerRoutes", () => {
  it.each([
    ["POST", "/v1/partners/me/business-context/import"],
    [
      "GET",
      "/v1/partners/me/business-context/import/00000000-0000-4000-8000-000000000000",
    ],
  ])("does not register retired import route %s %s", async (method, url) => {
    const app = Fastify();
    app.decorate("authenticate", async () => undefined);
    app.decorate("authenticatePartner", async () => undefined);
    await registerRoutes(app);

    const response = await app.inject({
      method: method as "GET" | "POST",
      url,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
