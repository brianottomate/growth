/**
 * Gate for /api/dev/login — the passwordless session-minting fixture.
 *
 * Open in local dev. On Vercel *preview* deploys it requires ADMIN_TOKEN (the
 * same credential /api/lab and the cron routes accept for curl/agents): preview
 * URLs get pasted around, and their Vercel-team login is a wider circle than
 * "may impersonate any Growth user". Everywhere else — production included —
 * it is closed regardless of any token. Pure so it can be unit-tested without
 * touching the auth config or the database.
 */
export interface DevLoginEnv {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  adminToken: string | undefined;
}

export function readDevLoginToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  return (
    bearer ??
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("x-admin-token")
  );
}

export function isDevLoginAllowed(req: Request, env: DevLoginEnv): boolean {
  if (env.nodeEnv === "development") return true;
  if (env.vercelEnv !== "preview") return false;
  if (!env.adminToken) return false;
  const token = readDevLoginToken(req);
  return Boolean(token) && token === env.adminToken;
}
