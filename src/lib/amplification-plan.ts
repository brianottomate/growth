import { AMPLIFICATION_ACTIONS } from "./amplification-slack";
import { z } from "zod";

export const amplificationPlatformSchema = z.enum([
  "linkedin",
  "x",
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
]);
export const amplificationAskSchema = z.enum([
  "planned",
  "asked",
  "confirmed",
  "fulfilled",
]);
export const amplificationActionSchema = z.enum(AMPLIFICATION_ACTIONS);

export function assertAmplificationAction(
  source: string,
  destination: string,
  action: string,
) {
  if (
    ["repost", "quote", "comment"].includes(action) &&
    source !== destination
  ) {
    throw new Error("Use adaptation for a post on a different platform.");
  }
  if (
    action === "story_share" &&
    (source !== destination || !["instagram", "facebook"].includes(destination))
  ) {
    throw new Error(
      "A Story share needs a source on the same Instagram or Facebook platform.",
    );
  }
}

/** A native repost is evidence for exactly that action and destination. Adaptations need explicit evidence. */
export function matchesAmplificationAction(
  destination: string,
  action: string,
  observedPlatform: string,
  observedKind: string | null | undefined,
) {
  const normalized =
    observedKind === "retweet" || observedKind === "reposts"
      ? "repost"
      : observedKind === "quotes"
        ? "quote"
        : observedKind;
  return (
    destination === observedPlatform &&
    ["repost", "quote", "comment", "story_share"].includes(action) &&
    normalized === action
  );
}

export function assertAmplificationOutputIdentity(
  expectedBrandId: string,
  destination: string,
  output: { brandId: string; platform: string },
) {
  if (output.brandId !== expectedBrandId || output.platform !== destination) {
    throw new Error(
      "The output must belong to the amplifier’s linked brand and destination platform.",
    );
  }
}
