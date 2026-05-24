// hearloop/apps/web/app/api/auth/login/route.ts
//
// Server-side login handler. Calls the Hearloop API, then sets an httpOnly
// cookie so the API key never touches client-side JavaScript.

import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://18-223-189-193.nip.io";

// Cookie is valid for 30 days. Refresh on each dashboard load is not needed
// because the API key itself doesn't expire — only revocation matters.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mode, ...payload } = body as {
    mode: "login" | "signup";
    email: string;
    password: string;
    name?: string;
    apiKey?: string; // signup: key returned from register, stored in cookie
  };

  const endpoint = mode === "signup"
    ? `${API_BASE}/v1/partners/register`
    : `${API_BASE}/v1/partners/login`;

  const apiRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      mode === "signup"
        ? { name: payload.name, email: payload.email, password: payload.password }
        : { email: payload.email, password: payload.password }
    ),
  });

  const data = await apiRes.json();

  if (!apiRes.ok) {
    return NextResponse.json(data, { status: apiRes.status });
  }

  // On signup the API returns the raw API key once — store it in the cookie.
  // On login the API only returns partnerId + name + keyPrefix (no raw key).
  // If the client passes an apiKey (from a previous signup stored temporarily),
  // we accept it here and store it in the cookie.
  const apiKey: string | null = data.apiKey ?? payload.apiKey ?? null;

  const session = {
    partnerId: data.partnerId,
    name: data.name,
    keyPrefix: data.keyPrefix ?? data.apiKey?.slice(0, 12) ?? null,
    apiKey,
  };

  const res = NextResponse.json({
    partnerId: data.partnerId,
    name: data.name,
    keyPrefix: session.keyPrefix,
    // Only return the raw key on signup so the UI can show the one-time modal.
    // After that it lives only in the httpOnly cookie.
    apiKey: mode === "signup" ? data.apiKey : undefined,
  });

  res.cookies.set("hl_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return res;
}
