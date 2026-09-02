import { describe, expect, it } from "bun:test";

import { creativeSourceKey } from "@/server/services/ads-draft.service";

/**
 * Meta signs creative urls and rotates the CDN edge, so the same file
 * arrives as a different string on every sync. If the dedupe key moved with
 * it, importing a proven creative twice would fill the library with copies.
 */
describe("creativeSourceKey", () => {
  it("ignores the signature and expiry query params", () => {
    const a =
      "https://scontent-lga3-1.xx.fbcdn.net/v/t45.1600-4/123456_n.jpg?_nc_cat=1&oh=00_AfAAA&oe=66E11111";
    const b =
      "https://scontent-lga3-1.xx.fbcdn.net/v/t45.1600-4/123456_n.jpg?_nc_cat=9&oh=00_AfZZZ&oe=66F99999";
    expect(creativeSourceKey(a)).toBe(creativeSourceKey(b));
  });

  it("survives Meta rotating the edge subdomain", () => {
    expect(
      creativeSourceKey(
        "https://scontent-lga3-1.xx.fbcdn.net/v/t45.1600-4/123456_n.jpg",
      ),
    ).toBe(
      creativeSourceKey(
        "https://scontent-iad3-2.xx.fbcdn.net/v/t45.1600-4/123456_n.jpg",
      ),
    );
  });

  it("keeps different creatives, and different providers, apart", () => {
    expect(
      creativeSourceKey("https://scontent.xx.fbcdn.net/v/t45/111_n.jpg"),
    ).not.toBe(
      creativeSourceKey("https://scontent.xx.fbcdn.net/v/t45/222_n.jpg"),
    );
    expect(
      creativeSourceKey("https://scontent.xx.fbcdn.net/v/t45/111_n.jpg"),
    ).not.toBe(
      creativeSourceKey("https://lh3.googleusercontent.com/v/t45/111_n.jpg"),
    );
  });

  it("falls back to the raw string rather than throwing", () => {
    expect(creativeSourceKey("not a url")).toBe("not a url");
  });
});
