import "server-only";

import { createFalClient } from "@fal-ai/client";

import { env } from "@/env";

/**
 * Image model selection is a SOURCE-CODE decision, deliberately not an env
 * var or user setting. Swap by editing this map. Tested alternatives:
 *   text:      "openai/gpt-image-2"        better text-in-image fidelity, pricier/slower
 *   reference: "fal-ai/flux-pro/kontext"   single-reference restyle, faster/cheaper
 *              "fal-ai/gpt-image-1.5/edit" previous OpenAI generation
 */
export const FAL_IMAGE_MODELS = {
  /** Pure text-to-image (no reference assets). */
  text: "fal-ai/flux/dev",
  /** Image-conditioned generation guided by reference images. */
  reference: "openai/gpt-image-2/edit",
} as const;

/** Kept for legacy rows created before per-run model selection. */
export const FAL_IMAGE_MODEL = FAL_IMAGE_MODELS.text;

export const isFalConfigured = Boolean(env.FAL_AI_API_KEY);

const client = env.FAL_AI_API_KEY
  ? createFalClient({ credentials: env.FAL_AI_API_KEY })
  : null;

function requireClient() {
  if (!client) throw new Error("Fal image generation is not configured.");
  return client;
}

export type FalImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

/**
 * Build the (model, input) pair for a generation. Reference images route to
 * the image-conditioned model with its own input dialect; otherwise the
 * cheaper text-to-image model. Keeping this in the client means the creative
 * run row and the queue submission can never disagree about the payload.
 */
export function buildFalImageRequest(input: {
  prompt: string;
  imageSize: FalImageSize;
  outputFormat: "jpeg" | "png";
  referenceImageUrls?: string[];
}): { model: string; providerInput: Record<string, unknown> } {
  if (input.referenceImageUrls?.length) {
    return {
      model: FAL_IMAGE_MODELS.reference,
      providerInput: {
        prompt: input.prompt,
        image_urls: input.referenceImageUrls.slice(0, 4),
        // gpt-image-2 sizes adaptively; named flux sizes don't apply here.
        image_size: "auto",
        quality: "high",
        output_format: input.outputFormat,
        num_images: 1,
      },
    };
  }
  return {
    model: FAL_IMAGE_MODELS.text,
    providerInput: {
      prompt: input.prompt,
      image_size: input.imageSize,
      output_format: input.outputFormat,
      num_images: 1,
      enable_safety_checker: true,
    },
  };
}

export async function submitFalImage(input: {
  model: string;
  providerInput: Record<string, unknown>;
  webhookUrl?: string;
}) {
  return requireClient().queue.submit(input.model, {
    input: input.providerInput,
    webhookUrl: input.webhookUrl,
    // The durable copy is the accepted media_asset on R2. Fal request payloads
    // do not need to remain in provider history once the run has completed.
    headers: { "X-Fal-Store-IO": "0" },
    storageSettings: { expiresIn: "1d" },
  });
}

export async function getFalImageStatus(model: string, requestId: string) {
  return requireClient().queue.status(model, { requestId });
}

export async function getFalImageResult(model: string, requestId: string) {
  return requireClient().queue.result(model, { requestId });
}

export async function cancelFalImage(model: string, requestId: string) {
  return requireClient().queue.cancel(model, { requestId });
}
