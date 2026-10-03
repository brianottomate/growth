import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OG_OPTIONS,
  ogSize,
  readOgOptions,
  studioImageUrl,
} from "./og-studio";

describe("public OG rendering contract", () => {
  test("image input cannot select external URLs or filesystem paths", () => {
    for (const image of [
      "https://example.com/private",
      "http://127.0.0.1",
      "../../.env",
      "/auth-hero.jpg",
    ]) {
      expect(readOgOptions(new URLSearchParams({ image })).image).toBe("none");
    }
    expect(
      readOgOptions(new URLSearchParams({ image: "wander-home" })).image,
    ).toBe("wander-home");
  });
  test("existing metadata requests retain their landscape brand defaults", () => {
    const options = readOgOptions(
      new URLSearchParams({
        title: "Campaigns",
        description: "Review campaigns",
      }),
    );
    expect(options.layout).toBe("brand");
    expect(ogSize(options.format)).toEqual({ width: 1200, height: 630 });
    expect(options.footer).toBe("Internal · Wander growth team");
  });
  test("copied designs round-trip punctuation and square dimensions", () => {
    const design = {
      ...DEFAULT_OG_OPTIONS,
      title: "A & B? #1",
      format: "square" as const,
      footer: "",
    };
    const url = new URL(studioImageUrl(design), "https://growth.example.com");
    expect(readOgOptions(url.searchParams)).toEqual(design);
    expect(ogSize(design.format)).toEqual({ width: 1200, height: 1200 });
  });
  test("public requests bound copy and ignore unsupported layout values", () => {
    const options = readOgOptions(
      new URLSearchParams({
        title: "a".repeat(500),
        description: "b".repeat(500),
        layout: "unknown",
        format: "huge",
      }),
    );
    expect(options.title.length).toBe(80);
    expect(options.description.length).toBe(140);
    expect(options.layout).toBe("brand");
    expect(options.format).toBe("landscape");
  });
});
