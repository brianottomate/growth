import type { CreativeImageModelId } from "@/lib/creative-image-models";

export const FAL_IMAGE_MODELS = {
  flux: {
    text: "fal-ai/flux/dev",
    reference: "openai/gpt-image-2/edit",
  },
} as const;

export type FalImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

export type FalAspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export function buildFalImageRequest(input: {
  profile: CreativeImageModelId;
  prompt: string;
  imageSize: FalImageSize;
  aspectRatio: FalAspectRatio;
  outputFormat: "jpeg" | "png";
  referenceImageUrls?: string[];
}): { model: string; providerInput: Record<string, unknown> } {
  const referenceImageUrls = input.referenceImageUrls?.slice(0, 4) ?? [];

  if (input.profile !== "flux")
    throw new Error(`The ${input.profile} profile does not run through Fal.`);

  if (referenceImageUrls.length) {
    return {
      model: FAL_IMAGE_MODELS.flux.reference,
      providerInput: {
        prompt: input.prompt,
        image_urls: referenceImageUrls,
        image_size: "auto",
        quality: "high",
        output_format: input.outputFormat,
        num_images: 1,
      },
    };
  }

  return {
    model: FAL_IMAGE_MODELS.flux.text,
    providerInput: {
      prompt: input.prompt,
      image_size: input.imageSize,
      output_format: input.outputFormat,
      num_images: 1,
      enable_safety_checker: true,
    },
  };
}

export function isTrustedFalAssetUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (
      url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".fal.ai")
    ) {
      return true;
    }
    return (
      url.hostname === "storage.googleapis.com" &&
      url.pathname.startsWith("/falserverless/")
    );
  } catch {
    return false;
  }
}
