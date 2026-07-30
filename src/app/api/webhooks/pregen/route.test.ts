import { describe, expect, test } from "bun:test";

import { hostFromUrl } from "./route";

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
