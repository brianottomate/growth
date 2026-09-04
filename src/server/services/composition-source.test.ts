import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { toSatoriImageSource } from "./composition-source";

const pixel = (format: "webp" | "png") =>
  sharp({
    create: { width: 2, height: 2, channels: 3, background: "#336699" },
  })
    [format]()
    .toBuffer();

describe("satori image source", () => {
  test("converts WebP, which satori cannot decode, to JPEG", async () => {
    const src = await toSatoriImageSource({
      body: await pixel("webp"),
      contentType: "image/webp",
    });
    expect(src.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(
      Buffer.from(src.split(",")[1]!, "base64"),
    ).metadata();
    expect(meta.format).toBe("jpeg");
  });

  test("passes a type satori decodes through untouched", async () => {
    const png = await pixel("png");
    const src = await toSatoriImageSource({
      body: png,
      contentType: "image/png; charset=binary",
    });
    expect(src).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });
});
