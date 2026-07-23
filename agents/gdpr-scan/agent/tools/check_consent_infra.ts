import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * Probe the consent plumbing itself:
 * - WanderOS sites: GET /api/geo should return {country, regime} with
 *   Cache-Control: no-store (a cached geo response is a bug).
 * - Any site: check whether the response stamps a regime cookie
 *   (wander_regime / wos_regime) for a cookie-less visitor.
 */
export default defineTool({
  description:
    "Check a site's consent infrastructure: /api/geo behavior (WanderOS sites) and regime-cookie stamping on a cookie-less request.",
  inputSchema: z.object({
    origin: z.string().url().describe("Site origin, e.g. https://germanvacationstays.de"),
  }),
  async execute({ origin }) {
    const base = new URL(origin);

    // 1. Regime cookie stamping on the document response.
    const docRes = await fetch(base.toString(), {
      redirect: "follow",
      headers: { Accept: "text/html", "User-Agent": "WanderGdprScan/0.1" },
    });
    const setCookies = docRes.headers.getSetCookie ? docRes.headers.getSetCookie() : [];
    const regimeCookie =
      setCookies.find((c) => c.startsWith("wander_regime=") || c.startsWith("wos_regime=")) ?? null;

    // 2. /api/geo probe (404 on non-WanderOS surfaces is expected).
    let geo: {
      status: number;
      body: unknown;
      cacheControl: string | null;
      cacheSafe: boolean;
    } | null = null;
    try {
      const geoRes = await fetch(new URL("/api/geo", base).toString(), {
        headers: { Accept: "*/*", "User-Agent": "WanderGdprScan/0.1" },
      });
      const cacheControl = geoRes.headers.get("cache-control");
      geo = {
        status: geoRes.status,
        body: geoRes.ok ? await geoRes.json().catch(() => null) : null,
        cacheControl,
        cacheSafe: cacheControl?.includes("no-store") ?? false,
      };
    } catch {
      geo = null;
    }

    return {
      documentStatus: docRes.status,
      regimeCookieStamped: regimeCookie !== null,
      regimeCookie: regimeCookie ? regimeCookie.split(";")[0] : null,
      allSetCookies: setCookies.map((c) => c.split(";")[0]),
      geoEndpoint: geo,
      verdictHints: [
        regimeCookie
          ? "Regime cookie stamped server-side — synchronous client resolution available."
          : "No regime cookie on the document response — client must fall back to /api/geo or timezone.",
        geo?.status === 200 && !geo.cacheSafe
          ? "WARNING: /api/geo responded without no-store — a shared cache could serve another visitor's country."
          : null,
      ].filter(Boolean),
    };
  },
});
