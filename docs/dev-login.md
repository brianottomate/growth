# Passwordless login for agent testing (local dev + Vercel previews)

`src/app/api/dev/login/route.ts` mints a real Better Auth session for an
existing user, no password, using
Better Auth's own primitives (`auth.$context` →
`ctx.internalAdapter.createSession(user.id)`; cookie signed with
`makeSignature` from `better-auth/crypto`, matching `setSessionCookie`).

**Gate:**

- Local dev (`NODE_ENV === "development"`): open, no token.
- Vercel **preview** deploys (`VERCEL_ENV === "preview"`): requires
  `ADMIN_TOKEN` — `Authorization: Bearer <ADMIN_TOKEN>`, `?token=<ADMIN_TOKEN>`,
  or `x-admin-token: <ADMIN_TOKEN>`. Same credential `/api/lab/*` and the cron
  routes accept for curl/agents. Preview URLs get pasted around and their
  Vercel-team login is a wider circle than "may impersonate any Growth user",
  hence the token even though the URL is not public.
- Everywhere else — production included — a bare 404, token or not.

**Works on any port.** The cookie is set directly, so trustedOrigins never
enters the picture — and dev config now also trusts `http://localhost:*`
for the normal sign-in/sign-up flows (port 3000 is often taken by another
project).

## Usage

Browser (agent/computer-use): navigate to
`http://localhost:<port>/api/dev/login` — sets the signed
`better-auth.session_token` cookie and 302s to `/app`. Tab is authenticated.

Headless (curl / scripts):

```bash
# Mint a session, get the cookie material as JSON:
curl -s "http://localhost:<port>/api/dev/login?mode=token"
# → { token, signedToken, cookieName, cookieValue, userId, email, expiresAt }

# Then send it as a cookie (no bearer plugin is enabled in this app):
curl -H "Cookie: <cookieName>=<cookieValue>" http://localhost:<port>/app/website
```

Query params (all optional):

- `?email=<addr>` — user to log in as (default `kristian@wander.com`)
- `?userId=<id>` — look up by id instead (takes precedence)
- `?mode=token` — return JSON instead of redirecting
- `?redirect=<path>` — where to 302 after setting the cookie (default `/app`)
- `?token=<ADMIN_TOKEN>` — preview deploys only; browsers can't set headers on
  a navigation, so this is how the cookie+redirect flow works there. The 302
  target does not carry the token, but it does land in the tab's history —
  prefer the header form from curl/scripts.

### On a Vercel preview

The deploy also sits behind Vercel's own deployment protection, so a plain
`curl` gets Vercel's login page first — use a browser that is signed in to
the `wanderdev` team, or Vercel's "Protection Bypass for Automation" header
alongside the token.

```bash
# Browser: paste into a Vercel-authenticated tab
https://growth-git-<branch>-wanderdev.vercel.app/api/dev/login?token=<ADMIN_TOKEN>

# curl (with a Vercel protection-bypass secret configured on the project):
curl -s "https://growth-git-<branch>-wanderdev.vercel.app/api/dev/login?mode=token" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"
```

## Scripted smoke test

`bun run smoke:preview` (`scripts/smoke-preview.ts`) does the whole loop an
agent would: mints a session, calls `/api/lab/sharp` (a create → PNG →
metadata round-trip — the native lib is what broke prod on the last sharp
bump, #113), runs a tRPC batch, and walks the main `/app/*` pages with the
cookie. Exits non-zero on any failure.

```bash
bun run smoke:preview                                               # local :3000
GROWTH_ORIGIN=https://growth-git-<branch>-wanderdev.vercel.app bun run smoke:preview
```

Reads `ADMIN_TOKEN` and `VERCEL_AUTOMATION_BYPASS_SECRET` from `.env`. It
sends the admin bearer only to dev-login and `/api/lab/*` — the app's
`bearer()` plugin reads any `Authorization: Bearer` as the session token, so
the cookie-authenticated calls must not carry it.

## Gotchas

- Cookie name is `better-auth.session_token` in dev; on previews (HTTPS) it is
  `__Secure-better-auth.session_token` with the `Secure` attribute. Value
  format: `encodeURIComponent("<token>.<base64 HMAC>")` — use `cookieValue`
  from the JSON verbatim.
- Sessions last 7 days and are real rows in the shared Neon DB.
- The session-create database hook runs (org scoping + analytics), same as a
  normal sign-in.
