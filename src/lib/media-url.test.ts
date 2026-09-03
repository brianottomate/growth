import { describe, expect, test } from "bun:test";

import { mediaTypeForUrl } from "./media-url";

describe("mediaTypeForUrl", () => {
  test("reads video containers off the path, query strings included", () => {
    expect(
      mediaTypeForUrl("https://cdn.example.com/uploads/chat/u/clip.mp4"),
    ).toBe("video");
    expect(mediaTypeForUrl("https://cdn.example.com/a.MOV?x=1")).toBe("video");
    expect(mediaTypeForUrl("https://cdn.example.com/a.webm#t=2")).toBe("video");
  });

  test("everything else is an image", () => {
    expect(mediaTypeForUrl("https://cdn.example.com/hero.jpg")).toBe("image");
    expect(mediaTypeForUrl("https://cdn.example.com/hero")).toBe("image");
    expect(mediaTypeForUrl("https://cdn.example.com/mp4-guide.png")).toBe(
      "image",
    );
  });
});
