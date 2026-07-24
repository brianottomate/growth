export const CREATIVE_IMAGE_MODEL_IDS = ["flux", "google"] as const;

export type CreativeImageModelId = (typeof CREATIVE_IMAGE_MODEL_IDS)[number];

export const DEFAULT_CREATIVE_IMAGE_MODEL_ID: CreativeImageModelId = "flux";

export const CREATIVE_IMAGE_MODELS: ReadonlyArray<{
  id: CreativeImageModelId;
  label: string;
  description: string;
}> = [
  {
    id: "flux",
    label: "Flux",
    description:
      "Fast Fal generation, with GPT Image for reference-conditioned work.",
  },
  {
    id: "google",
    label: "Google Nano Banana 2 (direct)",
    description:
      "Direct Gemini image generation using Wander's Google API key, with strong natural-language and reference understanding.",
  },
];
