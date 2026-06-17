// hearloop/apps/web/app/api/[...path]/route.ts

import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://18-223-189-193.nip.io";

function getSessionToken(req: NextRequest): string | null {
  const raw = req.cookies.get("hl_session")?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as {
      sessionToken?: string | null;
      apiKey?: string | null;
    };
    return session.sessionToken ?? session.apiKey ?? null;
  } catch {
    return null;
  }
}

function authHeader(req: NextRequest): string {
  const token = getSessionToken(req);
  if (token) return `Bearer ${token}`;
  return req.headers.get("authorization") ?? "";
}

async function proxy(
  req: NextRequest,
  path: string[],
  method: string
) {
  const url = `${API_BASE}/v1/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    authorization: authHeader(req),
  };

  const init: RequestInit = { method, headers };

  if (method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] =
      req.headers.get("content-type") ?? "application/json";
    init.body = await req.text();
  }

  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "POST");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "PATCH");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "DELETE");
}
