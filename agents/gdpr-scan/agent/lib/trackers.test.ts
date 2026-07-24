import { describe, expect, test } from "bun:test";

import { catalogFor } from "./catalog.js";
import { INLINE_SIGNATURES, matchTracker, matchTrackerUrl } from "./trackers.js";

/**
 * These guard the two classes of defect that make a consent scanner worse than
 * useless: a FALSE NEGATIVE lets a real pre-consent leak through with a 🟢, and a
 * FALSE POSITIVE trains everyone to ignore the report. Both have already bitten
 * this agent once.
 */

describe("catalogFor", () => {
  // wander.com 301s to www.wander.com, so the redirect target is what actually
  // gets scanned. Exact-match lookup sent it to the merchant default and flagged
  // every legitimately declared vendor as undeclared.
  test("resolves www. and subdomains to the apex catalog", () => {
    expect(catalogFor("wander.com").key).toBe("wander.com");
    expect(catalogFor("www.wander.com").key).toBe("wander.com");
    expect(catalogFor("app.wander.com").key).toBe("wander.com");
    expect(catalogFor("WWW.WANDER.COM").key).toBe("wander.com");
  });

  test("unknown merchant hosts fall back to the WanderOS default", () => {
    expect(catalogFor("germanvacationstays.de").key).toBe("*.wanderos-default");
  });
});

describe("matchTracker", () => {
  test("matches vendor subdomains", () => {
    expect(matchTracker("cdn.amplitude.com")?.vendor).toBe("Amplitude");
    expect(matchTracker("stats.g.doubleclick.net")?.vendor).toBe("Google DoubleClick");
  });

  // A footer social icon or share widget is not a pixel. The bare facebook.com
  // signature suffix-matched all of them.
  test("does not flag ordinary facebook.com links as a pixel", () => {
    expect(matchTracker("www.facebook.com")).toBeNull();
    expect(matchTracker("web.facebook.com")).toBeNull();
    expect(matchTracker("connect.facebook.net")?.vendor).toBe("Meta Pixel");
  });

  test("leaves non-tracking hosts alone", () => {
    expect(matchTracker("fonts.googleapis.com")).toBeNull();
    expect(matchTracker("assets.wander.com")).toBeNull();
  });
});

describe("matchTrackerUrl", () => {
  // The crown jewel: on Wander surfaces most vendors are fronted by same-origin
  // rewrites, so the vendor hostname never appears on the wire. Host-only
  // matching reports "clean" on a page that is leaking everything.
  test("catches first-party reverse-proxied trackers", () => {
    expect(matchTrackerUrl("https://www.wander.com/amp/script.js")?.vendor).toBe("Amplitude");
    expect(matchTrackerUrl("https://www.wander.com/rdt/pixel")?.vendor).toBe("Reddit Ads");
    expect(matchTrackerUrl("https://www.wander.com/bp/tag.js")?.vendor).toBe("bidr");
  });

  test("still catches direct third-party hosts", () => {
    expect(matchTrackerUrl("https://connect.facebook.net/en_US/fbevents.js")?.vendor).toBe(
      "Meta Pixel",
    );
  });

  test("does not flag ordinary first-party assets", () => {
    expect(matchTrackerUrl("https://www.wander.com/_next/static/chunk.js")).toBeNull();
    expect(matchTrackerUrl("https://www.wander.com/images/hero.webp")).toBeNull();
  });

  test("survives unparsable input", () => {
    expect(matchTrackerUrl("not a url")).toBeNull();
  });
});

describe("INLINE_SIGNATURES", () => {
  const osano = INLINE_SIGNATURES.find((s) => s.vendor === "Osano")!;

  // We write about CMP vendors. Prose must not read as an integration.
  test("Osano matches script/API usage but not prose", () => {
    expect(osano.pattern.test("<p>We evaluated Osano as a CMP vendor.</p>")).toBe(false);
    expect(osano.pattern.test('<script src="https://cmp.osano.com/abc/osano.js">')).toBe(true);
    expect(osano.pattern.test("Osano.cm.addEventListener('osano-cm-consent-saved', fn)")).toBe(true);
  });

  test("gtag and fbq fire on calls, not on the bare word", () => {
    const gtag = INLINE_SIGNATURES.find((s) => s.vendor === "Google gtag")!;
    expect(gtag.pattern.test("gtag('config', 'AW-123')")).toBe(true);
    expect(gtag.pattern.test("we removed the gtag integration")).toBe(false);
  });
});
