import { describe, expect, test } from "bun:test";

import { markTextColor, resolveMarkIconUrl } from "./brand-mark.service";

const brand = {
  id: "brand_01",
  name: "Chalets in Hocking Hills",
  logo: "https://assets/logo.png",
  organizationId: "org_01",
  brandIdentity: {
    colors: { primary: "#243735" },
    favicon: "https://site/favicon.png",
  },
  websiteMeta: null,
};

describe("brand mark", () => {
  test("text colour follows the tone, and colour means the brand's primary", () => {
    expect(markTextColor("white", brand.brandIdentity)).toBe("#ffffff");
    expect(markTextColor("dark", brand.brandIdentity)).toBe("#111111");
    expect(markTextColor("color", brand.brandIdentity)).toBe("#243735");
    expect(markTextColor("color", null)).toBe("#111111");
  });

  test("the icon comes from the source the recipe names", async () => {
    expect(await resolveMarkIconUrl({ source: "logo" }, brand)).toBe(
      brand.logo,
    );
    expect(await resolveMarkIconUrl({ source: "favicon" }, brand)).toBe(
      "https://site/favicon.png",
    );
    expect(
      await resolveMarkIconUrl(
        { source: "lockup", iconFrom: "favicon" },
        brand,
      ),
    ).toBe("https://site/favicon.png");
    // A text-only lockup has no icon and that is allowed.
    expect(await resolveMarkIconUrl({ source: "lockup" }, brand)).toBeNull();
  });
});
