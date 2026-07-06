import { NextRequest } from "next/server";

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstream = new URL(path.join("/"), `${BACKEND_INTERNAL_URL.replace(/\/$/, "")}/`);
  upstream.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    cache: "no-store"
  });

  const responseHeaders = new Headers();
  responseHeaders.set("content-type", response.headers.get("content-type") || "application/json");
  for (const name of ["content-disposition", "set-cookie", "cache-control"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
