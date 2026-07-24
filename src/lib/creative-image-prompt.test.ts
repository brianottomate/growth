import { describe, expect, test } from "bun:test";

import { buildCreativeImagePrompt } from "./creative-image-prompt";

describe("buildCreativeImagePrompt", () => {
  test("carries the reviewed brief and negative prompt into generation", () => {
    const prompt = buildCreativeImagePrompt({
      prompt: "Create a warm editorial arrival image.",
      purpose: "Instagram launch post",
      instructions: "Keep the center clear for caption-safe cropping.",
      negativePrompt: "No crowds or oversaturated HDR.",
      hasReferenceImages: false,
    });

    expect(prompt).toContain("Create a warm editorial arrival image.");
    expect(prompt).toContain("Creative purpose:\nInstagram launch post");
    expect(prompt).toContain(
      "Production notes:\nKeep the center clear for caption-safe cropping.",
    );
    expect(prompt).toContain("Avoid:\nNo crowds or oversaturated HDR.");
    expect(prompt).toContain(
      "prefer an atmospheric editorial detail over fabricating a specific real-world subject",
    );
    expect(prompt).toContain("Return exactly one finished image");
  });

  test("treats reference images as factual source material", () => {
    const prompt = buildCreativeImagePrompt({
      prompt: "Restyle this property photograph for a campaign.",
      hasReferenceImages: true,
    });

    expect(prompt).toContain(
      "Treat the supplied reference images as the source of truth.",
    );
    expect(prompt).toContain(
      "Do not invent property features, amenities, logos, people, or product attributes",
    );
    expect(prompt).not.toContain(
      "prefer an atmospheric editorial detail over fabricating",
    );
  });

  test("offers grounded alternatives for unreferenced property imagery", () => {
    const prompt = buildCreativeImagePrompt({
      prompt:
        "A cinematic luxury bedroom interior beside an infinity pool at golden hour",
      hasReferenceImages: false,
    });

    expect(prompt).toContain("instead of depicting a specific room");
    expect(prompt).toContain("instead of inventing a specific amenity");
    expect(prompt).toContain("do not invent a branded landmark");
  });
});
