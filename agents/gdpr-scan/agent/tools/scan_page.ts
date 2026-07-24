import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  CONSENT_MARKERS,
  INLINE_SIGNATURES,
  matchTracker,
  matchTrackerUrl,
} from "../lib/trackers.js";

/**
 * Static pre-consent scan of a page: fetches the served HTML exactly like a
 * first-visit browser (no cookies) and inventories script hosts, inline
 * tracker fingerprints, Set-Cookie headers, and consent-architecture markers.
 *
 * Limitation (by design of the spike): no JavaScript executes, so anything a
 * consent bootstrap would inject after a grant is invisible. A red flag here
 * is therefore *high-precision*: a tracker in the raw HTML loads before any
 * consent check can run.
 */
export default defineTool({
  description:
    "Fetch a URL as a cookie-less first-time visitor and inventory tracking scripts, inline tracker fingerprints, Set-Cookie headers, and Wander consent-architecture markers in the served HTML.",
  inputSchema: z.object({
    url: z.string().url().describe("Full URL to scan, e.g. https://wander.com/"),
    acceptLanguage: z
      .string()
      .default("en-US,en;q=0.9")
      .describe("Accept-Language header to send (geo-adjacent behavior varies)"),
  }),
  async execute({ url, acceptLanguage }) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 WanderGdprScan/0.1",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": acceptLanguage,
      },
    });
    const html = await res.text();

    // Script/iframe/link URLs referenced by the document.
    const refs = new Set<string>();
    // Absolute (https://…), protocol-relative (//…) AND root-relative (/amp/…).
    // The last form is the one that carries first-party-proxied trackers; a
    // pattern that only matched absolute URLs could never see them.
    const attrRe =
      /<(?:script|iframe|img|link)\b[^>]*?(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+|\/[^"'/][^"']*)["'][^>]*>/gi;
    for (const m of html.matchAll(attrRe)) {
      refs.add(m[1]);
    }

    const pageHost = new URL(res.url).hostname;

    // Resolve every reference against the final URL. Relative refs matter: on
    // Wander surfaces the trackers are fronted by SAME-ORIGIN rewrites (/amp/,
    // /rdt/, /li/ …), so filtering to third-party hosts first — as this did —
    // discarded exactly the requests we most need to see.
    const resolved: { url: string; host: string; sameOrigin: boolean }[] = [];
    for (const r of refs) {
      try {
        const u = new URL(r, res.url);
        resolved.push({
          url: u.toString().slice(0, 200),
          host: u.hostname,
          sameOrigin: u.hostname === pageHost,
        });
      } catch {
        /* ignore unparsable */
      }
    }

    const external = resolved.filter((e) => !e.sameOrigin);

    const trackers = resolved
      .map((e) => ({ ...e, match: matchTrackerUrl(e.url) }))
      .filter((e) => e.match)
      .map((e) => ({
        host: e.host,
        url: e.url,
        vendor: e.match!.vendor,
        category: e.match!.category,
        via: e.sameOrigin ? ("first-party proxy" as const) : ("third-party host" as const),
      }));

    const inlineHits = INLINE_SIGNATURES.filter((s) => s.pattern.test(html)).map((s) => ({
      vendor: s.vendor,
      note: s.note,
    }));

    const consentMarkers = CONSENT_MARKERS.filter((m) => m.pattern.test(html)).map(
      (m) => m.meaning,
    );

    const setCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie().map((c) => c.split(";")[0])
      : [];

    const unknownExternalHosts = [
      ...new Set(external.filter((e) => !matchTracker(e.host)).map((e) => e.host)),
    ];

    return {
      finalUrl: res.url,
      status: res.status,
      pageHost,
      trackers,
      inlineHits,
      consentMarkers,
      setCookies,
      unknownExternalHosts,
      externalHostCount: new Set(external.map((e) => e.host)).size,
      htmlBytes: html.length,
      caveat:
        "Static analysis: JavaScript did not execute. Consent-gated trackers injected post-grant are not visible here.",
    };
  },
});
