# Dev-only passwordless login (agent testing)

`src/app/api/dev/login/route.ts` — ported from the Homi project's helper.
Mints a real Better Auth session for an existing user, no password, using
Better Auth's own primitives (`auth.$context` →
`ctx.internalAdapter.createSession(user.id)`; cookie signed with
`makeSignature` from `better-auth/crypto`, matching `setSessionCookie`).

**Hard-gated:** returns a bare 404 unless `NODE_ENV === "development"` —
inert in Vercel preview/production builds.

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

## Gotchas

- Cookie name is `better-auth.session_token` in dev (the `__Secure-` prefix
  only appears in secure/prod contexts). Value format:
  `encodeURIComponent("<token>.<base64 HMAC>")` — use `cookieValue` from the
  JSON verbatim.
- Sessions last 7 days and are real rows in the shared Neon DB.
- The session-create database hook runs (org scoping + analytics), same as a
  normal sign-in.
