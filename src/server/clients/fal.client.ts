import "server-only";

import { createFalClient } from "@fal-ai/client";

import { env } from "@/env";
import {
  buildFalImageRequest,
  FAL_IMAGE_MODELS,
  type FalAspectRatio,
  type FalImageSize,
} from "@/server/clients/fal-request";

/**
 * Image model selection is a SOURCE-CODE decision, deliberately not an env
 * var. Operators choose a tested model profile; provider-specific endpoint and
 * input dialect selection remains here. Tested alternatives:
 *   text:      "openai/gpt-image-2"        better text-in-image fidelity, pricier/slower
 *   reference: "fal-ai/flux-pro/kontext"   single-reference restyle, faster/cheaper
 *              "fal-ai/gpt-image-1.5/edit" previous OpenAI generation
 */
/** Kept for legacy rows created before per-run model selection. */
export const FAL_IMAGE_MODEL = FAL_IMAGE_MODELS.flux.text;

export const isFalConfigured = Boolean(env.FAL_AI_API_KEY);

const client = env.FAL_AI_API_KEY
  ? createFalClient({ credentials: env.FAL_AI_API_KEY })
  : null;

function requireClient() {
  if (!client) throw new Error("Fal image generation is not configured.");
  return client;
}

export {
  buildFalImageRequest,
  FAL_IMAGE_MODELS,
  type FalAspectRatio,
  type FalImageSize,
};

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
