import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const queryToken = request.nextUrl.searchParams.get("token");
  const adminTokenHeader = request.headers.get("x-admin-token");

  const token = bearer ?? queryToken ?? adminTokenHeader;
  return token === env.ADMIN_TOKEN;
}

function pickHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    service: "admin-sample",
    auth: "ok",
    request: {
      method: request.method,
      path: request.nextUrl.pathname,
      ip:
        pickHeader(request, "x-real-ip") ??
        pickHeader(request, "x-forwarded-for"),
      ua: pickHeader(request, "user-agent"),
      vercel: {
        region: pickHeader(request, "x-vercel-id"),
        ipCountry: pickHeader(request, "x-vercel-ip-country"),
        ipCountryRegion: pickHeader(request, "x-vercel-ip-country-region"),
        ipCity: pickHeader(request, "x-vercel-ip-city"),
        ipLatitude: pickHeader(request, "x-vercel-ip-latitude"),
        ipLongitude: pickHeader(request, "x-vercel-ip-longitude"),
        forwardedFor: pickHeader(request, "x-forwarded-for"),
      },
    },
    runtime: {
      nodeEnv: env.NODE_ENV,
      nextPublicVercelEnv: env.NEXT_PUBLIC_VERCEL_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null,
      vercel: process.env.VERCEL ?? null,
    },
    usage: "GET /api/admin with Authorization: Bearer <ADMIN_TOKEN>",
    timestamp: new Date().toISOString(),
  });
}
