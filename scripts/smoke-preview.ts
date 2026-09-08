/**
 * Smoke-test a running Growth deploy the way an agent would: mint a session
 * through /api/dev/login, then walk the authed surface and the sharp probe.
 *
 *   bun scripts/smoke-preview.ts                       # local dev on :3000
 *   GROWTH_ORIGIN=https://growth-git-<branch>-wanderdev.vercel.app \
 *     bun scripts/smoke-preview.ts                     # a preview deploy
 *
 * Env (bun loads .env): ADMIN_TOKEN — required on previews, harmless locally.
 * VERCEL_AUTOMATION_BYPASS_SECRET — Vercel's "Protection Bypass for
 * Automation" secret, needed to get past deployment protection from a script.
 * Optional: SMOKE_PATHS (comma-separated) to override the page list,
 * SMOKE_EMAIL to log in as someone other than the fixture default.
 *
 * Exits non-zero on any failure so CI or an agent can gate on it.
 */

const origin = (process.env.GROWTH_ORIGIN ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const adminToken = process.env.ADMIN_TOKEN;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const DEFAULT_PATHS = [
  "/app",
  "/app/media",
  "/app/brands",
  "/app/campaigns",
  "/app/leads",
  "/app/listen",
];
const paths =
  process.env.SMOKE_PATHS?.split(",").map((p) => p.trim()) ?? DEFAULT_PATHS;

/** Vercel deployment-protection bypass only. */
function bypassHeaders(): Record<string, string> {
  return bypass ? { "x-vercel-protection-bypass": bypass } : {};
}

/**
 * Bypass + ADMIN_TOKEN. Only for routes where the admin token IS the
 * credential (dev-login, /api/lab). Never combine with the session cookie:
 * the app's Better Auth bearer() plugin reads any Authorization: Bearer
 * header as the session token, so the cookie would be ignored and the
 * request treated as anonymous.
 */
function adminHeaders(): Record<string, string> {
  const headers = bypassHeaders();
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;
  return headers;
}

type Result = { step: string; ok: boolean; detail: string };
const results: Result[] = [];
function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${step}  ${detail}`);
}

async function main() {
  console.log(`smoke → ${origin}`);

  // 1. Mint a session. A Vercel login page here means the bypass secret is
  //    missing or wrong; a 404 means the dev-login gate refused us.
  const loginUrl = new URL("/api/dev/login", origin);
  loginUrl.searchParams.set("mode", "token");
  if (process.env.SMOKE_EMAIL)
    loginUrl.searchParams.set("email", process.env.SMOKE_EMAIL);
  const loginRes = await fetch(loginUrl, {
    headers: adminHeaders(),
    redirect: "manual",
  });
  const loginType = loginRes.headers.get("content-type") ?? "";
  if (loginRes.status !== 200 || !loginType.includes("application/json")) {
    const hint =
      loginRes.status === 404
        ? "dev-login gate refused (not a preview, or ADMIN_TOKEN wrong)"
        : loginRes.headers.get("set-cookie")?.includes("_vercel_sso") ||
            loginType.includes("text/html")
          ? "landed on Vercel deployment protection — set VERCEL_AUTOMATION_BYPASS_SECRET"
          : "";
    record(
      "dev-login",
      false,
      `${loginRes.status} ${loginType} ${hint}`.trim(),
    );
    return;
  }
  const login = (await loginRes.json()) as {
    cookieName: string;
    cookieValue: string;
    email: string;
  };
  record("dev-login", true, `session for ${login.email}`);
  const cookie = `${login.cookieName}=${login.cookieValue}`;

  // 2. sharp probe: the native lib is what broke prod on the last bump.
  const sharpRes = await fetch(new URL("/api/lab/sharp", origin), {
    headers: adminHeaders(),
  });
  const sharpBody = (await sharpRes.json().catch(() => null)) as {
    ok?: boolean;
    sharp?: string;
    vips?: string;
    error?: string;
  } | null;
  record(
    "sharp",
    sharpRes.status === 200 && sharpBody?.ok === true,
    sharpBody?.ok
      ? `sharp ${sharpBody.sharp} / libvips ${sharpBody.vips}`
      : `${sharpRes.status} ${sharpBody?.error ?? ""}`.trim(),
  );

  // 3. tRPC through the same module graph the Assistant panel uses.
  const trpcUrl = new URL("/api/trpc/org.list", origin);
  trpcUrl.searchParams.set("batch", "1");
  trpcUrl.searchParams.set("input", JSON.stringify({ "0": { json: null } }));
  const trpcRes = await fetch(trpcUrl, {
    headers: { ...bypassHeaders(), cookie },
  });
  const trpcBody = await trpcRes.text();
  record(
    "trpc org.list",
    trpcRes.status === 200 && !trpcBody.includes('"error"'),
    `${trpcRes.status} ${trpcBody.slice(0, 80)}`,
  );

  // 4. Authed pages: a redirect to /signin means the cookie was not honoured.
  for (const path of paths) {
    // Same-origin redirects keep the cookie, so in-app hops (e.g. /app → the
    // default surface) are fine; landing on /signin is the failure.
    const res = await fetch(new URL(path, origin), {
      headers: { ...bypassHeaders(), cookie },
      redirect: "follow",
    });
    const landed = new URL(res.url).pathname;
    const bounced = landed.startsWith("/signin");
    record(
      `GET ${path}`,
      res.status === 200 && !bounced,
      res.redirected ? `${res.status} → ${landed}` : String(res.status),
    );
  }
}

await main();
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? ` — failed: ${failed.map((f) => f.step).join(", ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
