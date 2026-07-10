import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getSession } from "@/server/better-auth/server";

/**
 * /lab access — Kristian's private workspace (exploratory pages under
 * `src/app/lab/` and diagnostic endpoints under `src/app/api/lab/`).
 *
 * History: the old /api/test/* diagnostics shipped UNAUTHENTICATED and leaked
 * lead PII (removed 2026-07-10, commit 4bc58c1). Everything lab-shaped now
 * goes through this one gate so that can't happen again.
 *
 * Access = admin email session (browser) OR Bearer ADMIN_TOKEN (curl/scripts).
 * Dev mode is open, matching adminProcedure's posture.
 */

/** Single source of truth for admin emails (also referenced by trpc adminProcedure). */
export const ADMIN_EMAILS = [
  "kristian@wander.com",
  // Add more admin emails here as needed
];

export async function hasLabSession(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const session = await getSession();
  const email = session?.user?.email?.toLowerCase() ?? "";
  return ADMIN_EMAILS.includes(email);
}

/**
 * Route-handler guard. Returns a 404 response for outsiders (don't advertise
 * the lab's existence), null when access is granted.
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
