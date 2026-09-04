import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { toSatoriImageSource } from "./composition-source";

const decode = (src: string) =>
  sharp(Buffer.from(src.split(",")[1]!, "base64")).metadata();

describe("satori image source", () => {
  test("converts WebP, which satori cannot decode, to JPEG", async () => {
    const webp = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer();
    const src = await toSatoriImageSource(webp);
    expect(src.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect((await decode(src)).format).toBe("jpeg");
  });

  test("keeps alpha by emitting PNG, whatever the header said", async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const src = await toSatoriImageSource(png);
    expect(src.startsWith("data:image/png;base64,")).toBe(true);
    expect((await decode(src)).hasAlpha).toBe(true);
  });

  test("caps oversized sources", async () => {
    const wide = await sharp({
      create: { width: 3000, height: 100, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();
    expect((await decode(await toSatoriImageSource(wide))).width).toBe(2160);
  });
});
