import { describe, expect, test } from "bun:test";

import { hostFromUrl, tokenFromPreviewUrl } from "./route";

/**
 * WanderOS addresses prospects by `sourceUrl`; growth keys leads on a bare
 * domain. This function is the whole join, and on the first event for a
 * prospect it is the only correlation available — a mismatch does not error, it
 * silently returns `matched: false` for every future event on that build.
 */
describe("hostFromUrl", () => {
  test("normalises the shapes WanderOS will send", () => {
    expect(hostFromUrl("https://staymarquis.com")).toBe("staymarquis.com");
    expect(hostFromUrl("https://www.staymarquis.com")).toBe("staymarquis.com");
    expect(hostFromUrl("https://www.staymarquis.com/rentals?utm=x")).toBe(
      "staymarquis.com",
    );
    expect(hostFromUrl("http://StayMarquis.COM/")).toBe("staymarquis.com");
  });

  test("keeps a real subdomain, which is a different lead", () => {
    // sunkasa.holidayfuture.com is its own row, not holidayfuture.com.
    expect(hostFromUrl("https://sunkasa.holidayfuture.com")).toBe(
      "sunkasa.holidayfuture.com",
    );
  });

  test("returns null rather than guessing at an unparseable source", () => {
    expect(hostFromUrl("not a url")).toBeNull();
    expect(hostFromUrl("")).toBeNull();
  });
});

/**
 * The artifact API resolves monolith prospects by `preview_token`, and the
 * only place the token travels is inside `previewUrl` as `?t=`. If extraction
 * breaks, mirror rows lose their token and wander.com's /os/<slug> pitch page
 * 404s for every monolith prospect — silently, since the webhook still 200s.
 */
describe("tokenFromPreviewUrl", () => {
  test("extracts the t param from a canonical preview URL", () => {
    expect(
      tokenFromPreviewUrl(
        "https://the-boutique-home-group.wanderforoperators.com/?t=Ijgjt9U9TTkV4KSiKsqjIFV6txLINk8dQk1Flgwvui4",
      ),
    ).toBe("Ijgjt9U9TTkV4KSiKsqjIFV6txLINk8dQk1Flgwvui4");
  });

  test("returns null when there is no token to extract", () => {
    expect(tokenFromPreviewUrl("https://example.wanderforoperators.com/")).toBeNull();
    expect(tokenFromPreviewUrl("https://example.com/?t=")).toBeNull();
    expect(tokenFromPreviewUrl("not a url")).toBeNull();
    expect(tokenFromPreviewUrl(undefined)).toBeNull();
    expect(tokenFromPreviewUrl(null)).toBeNull();
  });
});
