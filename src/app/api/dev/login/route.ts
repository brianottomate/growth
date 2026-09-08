import { NextResponse, type NextRequest } from "next/server";
import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { userTable } from "@/server/db/schema";
import { isDevLoginAllowed } from "@/server/dev-login-access";

/**
 * Passwordless login for agent testing — local dev and Vercel previews.
 * Mints a real Better Auth session for an existing user using Better Auth's
 * own primitives — internalAdapter.createSession + a cookie signed exactly
 * like setSessionCookie's (`encodeURIComponent(token + "." + HMAC)`), so the
 * normal session middleware accepts it on ANY port (no trustedOrigins dance;
 * origin checks only guard the password/OAuth endpoints).
 *
 *   curl "http://localhost:<port>/api/dev/login?mode=token"   # JSON w/ token
 *   open  http://localhost:<port>/api/dev/login               # cookie + 302 /app
 *
 * Query params (all optional): email (default kristian@wander.com),
 * userId (takes precedence), mode=token, redirect (default /app).
 * NOTE: no bearer plugin is enabled here — use the Cookie header:
 *   curl -H "Cookie: <cookieName>=<cookieValue>" http://localhost:<port>/app/...
 *
 * Gate: see `@/server/dev-login-access` — open in local dev; on Vercel
 * *preview* deploys only with ADMIN_TOKEN (Bearer header, ?token=, or
 * x-admin-token); a bare 404 everywhere else, production included.
 */
export async function GET(req: NextRequest) {
  const allowed = isDevLoginAllowed(req, {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    adminToken: env.ADMIN_TOKEN,
  });
  if (!allowed) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "kristian@wander.com";
  const userId = url.searchParams.get("userId");
  const mode = url.searchParams.get("mode");
  const redirect = url.searchParams.get("redirect") ?? "/app";

  const user = userId
    ? await db.query.userTable.findFirst({ where: eq(userTable.id, userId) })
    : await db.query.userTable.findFirst({ where: eq(userTable.email, email) });
  if (!user) {
    return NextResponse.json(
      { error: `No user found for ${userId ? `id ${userId}` : email}` },
      { status: 404 },
    );
  }

  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const signedToken = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;
  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieValue = encodeURIComponent(signedToken);

  if (mode === "token") {
    return NextResponse.json({
      token: session.token,
      signedToken,
      cookieName,
      cookieValue,
      userId: user.id,
      email: user.email,
      expiresAt: session.expiresAt,
    });
  }

  const res = NextResponse.redirect(new URL(redirect, url.origin), 302);
  // Set the header directly — NextResponse.cookies would re-encode the value.
  // Mirror Better Auth's own attributes: a "__Secure-" name REQUIRES the
  // Secure attribute or browsers drop the cookie (Chrome treats localhost as
  // trustworthy, so Secure works over http://localhost).
  const attrs = ctx.authCookies.sessionToken.attributes;
  const parts = [
    `${cookieName}=${cookieValue}`,
    `Path=${attrs.path ?? "/"}`,
    "HttpOnly",
    `SameSite=${attrs.sameSite ?? "Lax"}`,
    "Max-Age=604800",
    ...(attrs.secure || cookieName.startsWith("__Secure-") ? ["Secure"] : []),
  ];
  res.headers.append("set-cookie", parts.join("; "));
  return res;
}
