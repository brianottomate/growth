import { describe, expect, test } from "bun:test";

import { brandFontFamily, parseGoogleFontCss } from "./composition-fonts";

describe("brand fonts", () => {
  test("reads weight and url for the formats satori can decode", () => {
    const css = `
      @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/v20/a.ttf) format('truetype'); }
      @font-face { font-family: 'Inter'; font-style: normal; font-weight: 700;
        src: url(https://fonts.gstatic.com/s/inter/v20/b.ttf) format('woff'); }
      @font-face { font-family: 'Inter'; font-weight: 900;
        src: url(https://fonts.gstatic.com/s/inter/v20/c.woff2) format('woff2'); }
    `;
    expect(parseGoogleFontCss(css)).toEqual([
      { weight: 400, url: "https://fonts.gstatic.com/s/inter/v20/a.ttf" },
      { weight: 700, url: "https://fonts.gstatic.com/s/inter/v20/b.ttf" },
    ]);
  });

  test("prefers the heading face, then the first, then none", () => {
    expect(
      brandFontFamily({
        fonts: [
          { family: "Inter", role: "body" },
          { family: "Gentium Book Plus", role: "heading" },
        ],
      }),
    ).toBe("Gentium Book Plus");
    expect(brandFontFamily({ fonts: [{ family: "Inter" }] })).toBe("Inter");
    expect(brandFontFamily(null)).toBeNull();
  });
});
