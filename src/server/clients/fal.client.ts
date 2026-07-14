import "server-only";

import { createFalClient } from "@fal-ai/client";

import { env } from "@/env";

export const FAL_IMAGE_MODEL = "fal-ai/flux/dev" as const;

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

export async function submitFalImage(input: {
  prompt: string;
  imageSize: FalImageSize;
  outputFormat: "jpeg" | "png";
  webhookUrl?: string;
}) {
  return requireClient().queue.submit(FAL_IMAGE_MODEL, {
    input: {
      prompt: input.prompt,
      image_size: input.imageSize,
      output_format: input.outputFormat,
      num_images: 1,
      enable_safety_checker: true,
    },
    webhookUrl: input.webhookUrl,
    // The durable copy is the accepted Vercel Blob asset. Fal request payloads
    // do not need to remain in provider history once the run has completed.
    headers: { "X-Fal-Store-IO": "0" },
    storageSettings: { expiresIn: "1d" },
  });
}

export async function getFalImageStatus(requestId: string) {
  return requireClient().queue.status(FAL_IMAGE_MODEL, { requestId });
}

export async function getFalImageResult(requestId: string) {
  return requireClient().queue.result(FAL_IMAGE_MODEL, { requestId });
}

export async function cancelFalImage(requestId: string) {
  return requireClient().queue.cancel(FAL_IMAGE_MODEL, { requestId });
}
