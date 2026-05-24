// hearloop/apps/web/app/api/[...path]/route.ts
//
// Proxies /api/* → https://18-223-189-193.nip.io/v1/*
//
// The API key is read from the httpOnly "hl_session" cookie — it never
// passes through client-side JavaScript. The Authorization header is
// injected server-side here before forwarding to the Hearloop API.

import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://18-223-189-193.nip.io";

/** Read the API key from the httpOnly session cookie. */
function getApiKey(req: NextRequest): string | null {
  const raw = req.cookies.get("hl_session")?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { apiKey?: string | null };
    return session.apiKey ?? null;
  } catch {
    return null;
  }
}

/** Build the Authorization header — prefer cookie key, fall back to forwarded header. */
function authHeader(req: NextRequest): string {
  const cookieKey = getApiKey(req);
  if (cookieKey) return `Bearer ${cookieKey}`;
  // Fallback: allow explicit Authorization header (used by widget / server-side callers)
  return req.headers.get("authorization") ?? "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/v1/${path.join("/")}${req.nextUrl.search}`;
  const res = await fetch(url, {
    headers: { authorization: authHeader(req) },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/v1/${path.join("/")}${req.nextUrl.search}`;
  const body = await req.text();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      authorization: authHeader(req),
    },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/v1/${path.join("/")}${req.nextUrl.search}`;
  const body = await req.text();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      authorization: authHeader(req),
    },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${API_BASE}/v1/${path.join("/")}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { authorization: authHeader(req) },
  });
  return new Response(null, { status: res.status });
}
