import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getSession } from "@/server/better-auth/server";

/**
 * /lab access — the team's internal workspace (exploratory pages under
 * `src/app/lab/` and diagnostic endpoints under `src/app/api/lab/`).
 *
 * History: the old /api/test/* diagnostics shipped UNAUTHENTICATED and leaked
 * lead PII (removed 2026-07-10, commit 4bc58c1). Everything lab-shaped now
 * goes through this one gate so that can't happen again. The gate stays
 * closed to anonymous traffic for that reason; what it no longer does is
 * restrict to one person.
 *
 * Access = any signed-in user (browser) OR Bearer ADMIN_TOKEN (curl/scripts).
 * Sign-up is restricted to @wander.com in the Better Auth config, so a
 * session is a teammate. Dev mode is open.
 */

export async function hasLabSession(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const session = await getSession();
  return Boolean(session?.user);
}

/**
 * Route-handler guard. Returns a 404 response for anonymous callers (don't
 * advertise the lab's existence), null when access is granted.
 */
export async function assertLabAccess(
  request: Request,
): Promise<NextResponse | null> {
  // Bearer ADMIN_TOKEN — for curl and scripts
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (bearer && bearer === env.ADMIN_TOKEN) return null;

  if (await hasLabSession()) return null;

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
