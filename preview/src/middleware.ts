import { defineMiddleware } from "astro:middleware";
import { PREVIEW_HOST_ZONE } from "astro:env/server";

// Preview access + routing, in one place.
//
// TOKEN POLICY (deliberate, and different from the usual advice): the token
// arrives as `?t=` and we persist it to a cookie, but we do NOT redirect to a
// clean URL. Stripping it would make the address bar unshareable, and the way
// these links actually travel is a person copying the URL out of their browser
// and pasting it to a colleague or a prospect. So:
//
//   * `?t=` stays in the URL, always. Copy-paste keeps working.
//   * the cookie is a convenience layer, so navigating to a tokenless path in
//     the same browser still resolves.
//
// The cookie is host-only (no `domain` attribute), which on a per-prospect
// subdomain means the browser itself prevents one prospect's cookie from being
// read on another's host. On the shared /p/ host it is only a convenience and
// carries no isolation claim — the token in the URL is still the credential.
//
// HOST MODE is additive and off until PREVIEW_HOST_ZONE names a zone. When on,
// `<slug>.<zone>/<path>` rewrites to the canonical `/p/<token>` handler, so
// root-relative links work without any renderer-side link rewriting. `/p/` and
// `/m/` keep working forever as the debug paths.

export const PREVIEW_TOKEN_COOKIE = "wos_preview_token";
export const PREVIEW_TOKEN_PARAM = "t";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, request } = context;

  // `?t=` is the canonical carrier, but the path-mode route puts the native
  // token in the path itself (`/p/<token>`). Persisting that too means
  // tokenless navigation works from a bare `/p/` link as well.
  const queryToken =
    url.searchParams.get(PREVIEW_TOKEN_PARAM) ?? pathToken(url.pathname);
  if (queryToken) {
    cookies.set(PREVIEW_TOKEN_COOKIE, queryToken, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  const token = queryToken ?? cookies.get(PREVIEW_TOKEN_COOKIE)?.value ?? null;
  context.locals.previewToken = token;

  const slug = previewSlugFromHost(request.headers.get("host"));
  context.locals.previewSlug = slug;

  // Host mode: the subdomain is the vanity identifier, the token is still the
  // credential. Rewriting (not redirecting) keeps the pretty URL in the bar.
  if (slug && isRewritableHostPath(url.pathname)) {
    if (!token) return notFound();
    return context.rewrite(
      `/p/${encodeURIComponent(token)}${url.search}`,
    );
  }

  const response = await next();
  applyPreviewHeaders(response);
  return response;
});

/**
 * Returns the prospect slug when the request arrived on a preview subdomain of
 * the configured zone, else null. Deliberately one label deep: a wildcard cert
 * covers `*.zone` only, so `a.b.zone` is not a preview host.
 */
export function previewSlugFromHost(hostHeader: string | null): string | null {
  if (!PREVIEW_HOST_ZONE || !hostHeader) return null;
  const host = hostHeader.split(":")[0]!.toLowerCase().replace(/\.$/, "");
  const zone = PREVIEW_HOST_ZONE.toLowerCase();
  if (!host.endsWith(`.${zone}`)) return null;

  const label = host.slice(0, -(zone.length + 1));
  if (!label || label.includes(".")) return null;
  // `www.zone` is the zone itself, not a prospect.
  if (label === "www") return null;
  return label;
}

/** The native token when it is carried in the path, as `/p/<token>`. */
function pathToken(pathname: string): string | null {
  const match = /^\/p\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

/** Astro internals and static assets must reach their real handlers. */
function isRewritableHostPath(pathname: string): boolean {
  if (pathname.startsWith("/p/") || pathname.startsWith("/m/")) return false;
  if (pathname.startsWith("/_")) return false;
  if (pathname === "/robots.txt" || pathname === "/favicon.ico") return false;
  return true;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * Every preview response is private and unindexable. A convincing full site
 * built from a prospect's own content is a worse thing to leak into an index
 * than an obviously-internal page, so this is belt and braces with the
 * per-route headers and the meta tag in the layout.
 */
function applyPreviewHeaders(response: Response): void {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (!response.headers.has("Referrer-Policy")) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }
}
