// hearloop/apps/api/src/lib/authenticate-partner.ts

import type { FastifyReply, FastifyRequest } from "fastify";
import { lookupPartnerByApiKey } from "./lookup-api-key";
import { loadPartnerById } from "./load-partner";
import { verifyPartnerSession } from "./partner-session";

function applyOriginCors(
  reply: FastifyReply,
  allowedOrigins: string | null,
  requestOrigin: string | undefined
): boolean {
  if (!allowedOrigins || !requestOrigin) return true;

  const allowed = allowedOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (!allowed.includes(requestOrigin)) {
    return false;
  }

  reply.header("Access-Control-Allow-Origin", requestOrigin);
  return true;
}

/** Bearer sk-live_* secret keys only (server / curl). */
export async function authenticateSecretKey(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing_auth" });
    return;
  }

  const token = auth.slice(7);
  const partner = await lookupPartnerByApiKey(token, {
    allowedTypes: ["secret"],
  });

  if (!partner) {
    reply.code(401).send({ error: "invalid_api_key" });
    return;
  }

  const requestOrigin = req.headers.origin as string | undefined;
  if (
    partner.allowedOrigins &&
    requestOrigin &&
    !applyOriginCors(reply, partner.allowedOrigins, requestOrigin)
  ) {
    reply.code(403).send({ error: "origin_not_allowed" });
    return;
  }

  (req as any).partner = {
    id: partner.partnerId,
    name: partner.name,
    webhookUrl: partner.webhookUrl,
    allowedOrigins: partner.allowedOrigins,
    businessContext: partner.businessContext,
  };
}

/** Dashboard session (hlps.*) or secret key for backward-compatible API access. */
export async function authenticatePartner(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing_auth" });
    return;
  }

  const token = auth.slice(7);

  if (token.startsWith("hlps.")) {
    const session = verifyPartnerSession(token);
    if (!session) {
      reply.code(401).send({ error: "invalid_session" });
      return;
    }

    const partner = await loadPartnerById(session.partnerId);
    if (!partner) {
      reply.code(401).send({ error: "invalid_session" });
      return;
    }

    (req as any).partner = partner;
    return;
  }

  await authenticateSecretKey(req, reply);
}
