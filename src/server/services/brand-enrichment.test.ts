import { describe, expect, test } from "bun:test";

import { identityFromBranding } from "./brand-enrichment.service";

describe("identity from Firecrawl branding", () => {
  test("keeps only hex colours, typed fonts, and the real logo", () => {
    const identity = identityFromBranding(
      {
        colorScheme: "light",
        colors: { primary: "#243735", accent: "rgb(23, 79, 81)", link: "#174F51" },
        typography: {
          fontFamilies: { primary: "Inter", heading: "Gentium Book Plus" },
        },
        fonts: [{ family: "Inter" }],
        logo: "https://chaletshh.com/logo.svg",
        personality: {
          tone: "professional",
          energy: "medium",
          targetAudience: "travelers and vacationers",
        },
      },
      { favicon: "https://chaletshh.com/favicon.png" },
    );
    expect(identity?.colors).toEqual({
      primary: "#243735",
      secondary: undefined,
      accent: undefined,
    });
    expect(identity?.fonts).toEqual([
      { family: "Inter", role: "body" },
      { family: "Gentium Book Plus", role: "heading" },
    ]);
    expect(identity?.logo).toBe("https://chaletshh.com/logo.svg");
    expect(identity?.favicon).toBe("https://chaletshh.com/favicon.png");
    expect(identity?.personality?.tone).toBe("professional");
    expect(identity?.raw?.logo).toBe("https://chaletshh.com/logo.svg");
  });

  test("is absent when Firecrawl returned no profile", () => {
    expect(identityFromBranding(undefined, {})).toBeUndefined();
  });
});
