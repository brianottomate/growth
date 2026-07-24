import { describe, expect, test } from "bun:test";

import { buildFalImageRequest, isTrustedFalAssetUrl } from "./fal-request";

const baseInput = {
  prompt: "A grounded editorial image",
  imageSize: "landscape_16_9" as const,
  aspectRatio: "16:9" as const,
  outputFormat: "jpeg" as const,
};

describe("buildFalImageRequest", () => {
  test("keeps the existing Flux text-to-image request", () => {
    const request = buildFalImageRequest({
      ...baseInput,
      profile: "flux",
    });

    expect(request.model).toBe("fal-ai/flux/dev");
    expect(request.providerInput).toEqual({
      prompt: baseInput.prompt,
      image_size: "landscape_16_9",
      output_format: "jpeg",
      num_images: 1,
      enable_safety_checker: true,
    });
  });

  test("does not silently send the direct Google profile through Fal", () => {
    expect(() =>
      buildFalImageRequest({
        ...baseInput,
        profile: "google",
      }),
    ).toThrow("does not run through Fal");
  });
});

describe("isTrustedFalAssetUrl", () => {
  test("accepts Fal media and Fal's Google Storage output bucket", () => {
    expect(
      isTrustedFalAssetUrl(
        "https://v3b.fal.media/files/b/example/generated.png",
      ),
    ).toBe(true);
    expect(
      isTrustedFalAssetUrl(
        "https://storage.googleapis.com/falserverless/example_outputs/generated.png",
      ),
    ).toBe(true);
  });

  test("does not broaden trust to arbitrary Google Storage or lookalike hosts", () => {
    expect(
      isTrustedFalAssetUrl(
        "https://storage.googleapis.com/unrelated-bucket/generated.png",
      ),
    ).toBe(false);
    expect(
      isTrustedFalAssetUrl("https://fal.media.example.com/generated.png"),
    ).toBe(false);
    expect(
      isTrustedFalAssetUrl("http://v3b.fal.media/files/generated.png"),
    ).toBe(false);
  });
});
