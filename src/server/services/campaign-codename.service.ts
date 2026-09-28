import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { eq } from "drizzle-orm";

import { campaignCodenamePrompt } from "@/server/ai/prompts";
import { CLAUDE_MODELS } from "@/server/clients/claude.client";
import { db } from "@/server/db";
import { brandTable, campaignTable } from "@/server/db/schema";

const CODENAME = /^[a-z]+_[a-z]+$/;

/** The codename a campaign name ends with, if it has one. */
export function campaignCodenameOf(name: string): string | null {
  return /_([a-z]+_[a-z]+)$/.exec(name)?.[1] ?? null;
}

/**
 * A fresh two-word codename for a new campaign in this organization, or null
 * when the model is unreachable or answers with one already taken. Never
 * blocks creating the campaign.
 */
export async function newCampaignCodename(
  organizationId: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select({ name: campaignTable.name })
      .from(campaignTable)
      .innerJoin(brandTable, eq(brandTable.id, campaignTable.brandId))
      .where(eq(brandTable.organizationId, organizationId));
    const taken = [
      ...new Set(rows.map((r) => campaignCodenameOf(r.name)).filter(Boolean)),
    ] as string[];
    const { text } = await generateText({
      model: anthropic(CLAUDE_MODELS.HAIKU_4_5),
      ...campaignCodenamePrompt({ taken }),
      maxOutputTokens: 20,
      temperature: 1,
      // A nickname is not worth holding up the create for.
      abortSignal: AbortSignal.timeout(4000),
      maxRetries: 0,
    });
    const codename = text.trim().toLowerCase();
    return CODENAME.test(codename) && !taken.includes(codename)
      ? codename
      : null;
  } catch {
    return null;
  }
}
