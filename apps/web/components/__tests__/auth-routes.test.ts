const { TextDecoder, TextEncoder } = require("node:util");
const { deserialize, serialize } = require("node:v8");
const {
  ReadableStream,
  TransformStream,
  WritableStream,
  TextDecoderStream,
  TextEncoderStream,
} = require("node:stream/web");
Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
  WritableStream,
  TextDecoderStream,
  TextEncoderStream,
  structuredClone: (value: unknown) => deserialize(serialize(value)),
});
const webPrimitives = require("next/dist/compiled/@edge-runtime/primitives");
Object.assign(globalThis, {
  Request: webPrimitives.Request,
  Response: webPrimitives.Response,
  Headers: webPrimitives.Headers,
});

const { NextRequest } = require("next/server");
const { POST: login } = require("../../app/api/auth/login/route");
const { POST: logout } = require("../../app/api/auth/logout/route");

test("login writes the Partner dashboard session to an httpOnly SameSite=Lax cookie", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ partnerId: "partner-a", name: "Acme", sessionToken: "dashboard-token" }),
  });
  const request = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ mode: "login", email: "owner@example.com", password: "secret" }),
    headers: { "content-type": "application/json" },
  });

  const response = await login(request);
  const cookie = response.headers.get("set-cookie");

  expect(cookie).toContain("hl_session=");
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);
});

test("logout expires the Partner dashboard session cookie", async () => {
  const response = await logout();
  const cookie = response.headers.get("set-cookie");

  expect(cookie).toContain("hl_session=");
  expect(cookie).toMatch(/Max-Age=0/i);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);
});
