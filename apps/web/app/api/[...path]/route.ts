// hearloop/apps/web/app/api/[...path]/route.ts

import { NextRequest } from "next/server";

const API_BASE = "http://18.223.189.193:3001";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const res = await fetch(url, { headers: { authorization: req.headers.get("authorization") ?? "" } });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const body = await req.text();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      authorization: req.headers.get("authorization") ?? "",
    },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${API_BASE}/${path.join("/")}`;
  const res = await fetch(url, { method: "DELETE", headers: { authorization: req.headers.get("authorization") ?? "" } });
  return new Response(null, { status: res.status });
}