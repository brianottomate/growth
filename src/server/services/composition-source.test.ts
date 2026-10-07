import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  removeLightIconBackground,
  tintSilhouette,
} from "./composition-source";

describe("favicon tones", () => {
  test("removes an opaque white matte and renders the coloured glyph white", async () => {
    const source = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 8, height: 8, channels: 3, background: "#ac1f24" },
          })
            .png()
            .toBuffer(),
          left: 4,
          top: 4,
        },
      ])
      .png()
      .toBuffer();
    const clean = await removeLightIconBackground(source);
    const { data } = await sharp(await tintSilhouette(clean, "#ffffff"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    const centre = (8 * 16 + 8) * 4;
    expect(Array.from(data.subarray(centre, centre + 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });
  test("preserves transparent marks and opaque coloured badges", async () => {
    for (const background of [
      "#ac1f24",
      { r: 255, g: 255, b: 255, alpha: 0 },
    ]) {
      const png = await sharp({
        create: { width: 16, height: 16, channels: 4, background },
      })
        .png()
        .toBuffer();
      expect(await removeLightIconBackground(png)).toEqual(png);
    }
  });
});
