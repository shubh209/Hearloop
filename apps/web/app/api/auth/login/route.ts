// hearloop/apps/web/app/api/auth/login/route.ts

import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://18-223-189-193.nip.io";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mode, ...payload } = body as {
    mode: "login" | "signup";
    email: string;
    password: string;
    name?: string;
    businessContext?: string | null;
    skipBusinessContext?: boolean;
    industryTemplate?: string | null;
  };

  const endpoint =
    mode === "signup"
      ? `${API_BASE}/v1/partners/register`
      : `${API_BASE}/v1/partners/login`;

  const registerBody =
    mode === "signup"
      ? {
          name: payload.name,
          email: payload.email,
          password: payload.password,
          businessContext: payload.skipBusinessContext
            ? null
            : payload.businessContext ?? null,
          industryTemplate: payload.industryTemplate ?? null,
        }
      : { email: payload.email, password: payload.password };

  const apiRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registerBody),
  });

  const data = await apiRes.json();

  if (!apiRes.ok) {
    return NextResponse.json(data, { status: apiRes.status });
  }

  const sessionToken: string = data.sessionToken;
  if (!sessionToken) {
    return NextResponse.json(
      { error: "missing_session_token" },
      { status: 500 }
    );
  }

  const session = {
    partnerId: data.partnerId,
    name: data.name,
    sessionToken,
  };

  const res = NextResponse.json({
    partnerId: data.partnerId,
    name: data.name,
    hasBusinessContext: data.hasBusinessContext ?? true,
    embedKeyPrefix: data.embedKeyPrefix ?? null,
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
