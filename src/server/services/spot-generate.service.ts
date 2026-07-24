import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { platformPostTable } from "@/server/db/schema";
import { SPOT_PILL_INSTRUCTION, type SpotPill } from "@/lib/spot-pills";

const MODEL = "claude-sonnet-5";

const CaptionSchema = z.object({
  caption: z
    .string()
    .describe(
      "The ready-to-post caption for THIS platform, in the composed brand+channel voice. " +
        "Respect the platform's norms and length. Include hashtags inline only where natural.",
    ),
});

export type GenerateSpotCaptionInput = {
  platformPostId: string;
  pills?: SpotPill[];
  steer?: string;
};

/**
 * Remix a content idea's brief into a platform-specific caption, in the voice
 * composed from the brand fingerprint + this channel's fingerprint. The brand
 * voice is the base; the channel fingerprint enhances it, or fully overrides it
 * when `overridesBrand` is set (see ChannelFingerprint).
 *
 * Side-effect-free: returns the draft caption for review. The caller persists
 * it via ContentService.setSpotText. This is also the function the chat's
 * generate tool will call, so UI + chat stay identical.
 */
export async function generateSpotCaption(
  input: GenerateSpotCaptionInput,
): Promise<{ caption: string }> {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    with: {
      contentPost: true,
      brand: { columns: { name: true, tagline: true, brandFingerprint: true } },
      channel: { columns: { channelFingerprint: true } },
    },
  });
  if (!spot) throw new Error("Spot not found");

  const idea = spot.contentPost;
  const brand = spot.brand;

  // compose(brand, channel) → the voice injected into the prompt.
  const brandVoice = brand?.brandFingerprint?.fingerprintText?.trim();
  const channelFp = spot.channel?.channelFingerprint;
  const channelVoice = channelFp?.fingerprintText?.trim();
  const voice =
    channelVoice && channelFp?.overridesBrand
      ? channelVoice
      : [brandVoice, channelVoice ? `For ${spot.platform} specifically: ${channelVoice}` : null]
          .filter(Boolean)
          .join("\n\n");

  const pillLines = (input.pills ?? [])
    .map((p) => SPOT_PILL_INSTRUCTION[p])
    .filter(Boolean);

  const system = [
    `You are a senior social content strategist for ${brand?.name ?? "the brand"}${
      brand?.tagline ? ` (${brand.tagline})` : ""
    }.`,
    voice
      ? `Voice:\n${voice}`
      : "Write in a confident, premium, inviting travel-brand voice.",
    `You are writing the caption for ONE platform: ${spot.platform}${
      spot.format ? ` (${spot.format})` : ""
    }. Match that platform's norms, tone, and length.`,
  ].join("\n\n");

  const prompt = [
    idea?.title ? `Content idea: ${idea.title}` : null,
    idea?.hook ? `Hook: ${idea.hook}` : null,
    idea?.captionDirection ? `Caption direction: ${idea.captionDirection}` : null,
    idea?.visualDirection ? `Visual direction: ${idea.visualDirection}` : null,
    idea?.ctaText ? `Call to action: ${idea.ctaText}` : null,
    idea?.ctaKeyword ? `Comment-trigger keyword: ${idea.ctaKeyword}` : null,
    idea?.kpi ? `Primary KPI: ${idea.kpi}` : null,
    spot.text ? `Current caption (improve / rewrite this):\n${spot.text}` : null,
    pillLines.length ? `Style adjustments:\n- ${pillLines.join("\n- ")}` : null,
    input.steer?.trim() ? `Extra direction: ${input.steer.trim()}` : null,
    `Write the platform-ready caption now.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: CaptionSchema }),
    system,
    prompt,
    temperature: 0.8,
  });

  return { caption: output.caption };
}
