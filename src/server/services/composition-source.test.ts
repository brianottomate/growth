import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  toSatoriImageSource,
  traceSilhouette,
  unwrapImageProxy,
} from "./composition-source";

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

describe("brand mark sources", () => {
  test("unwraps a WanderOS image proxy to the file it serves", () => {
    expect(
      unwrapImageProxy(
        "https://www.chaletshh.com/i/width=32,height=32,fit=contain,format=png?src=https%3A%2F%2Fassets-websites.wander.com%2F1%2Ffavicon-abc.png",
      ),
    ).toBe("https://assets-websites.wander.com/1/favicon-abc.png");
    expect(unwrapImageProxy("https://assets/logo.png")).toBe("https://assets/logo.png");
    expect(unwrapImageProxy("not a url")).toBe("not a url");
  });

  test("traces a flat shape's alpha to a single-colour SVG", async () => {
    const disc = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="64" height="64"><circle cx="32" cy="32" r="24" fill="#243735"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    const svg = await traceSilhouette(disc, "#ffffff");
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#ffffff"');
    // An opaque image has no alpha to cut; that is a null, not a rectangle.
    const opaque = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    expect(await traceSilhouette(opaque, "#ffffff")).toBeNull();
  });
});
