import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { type BrandListeningStory, brandTable } from "@/server/db/brand-schema";
import { type ChannelFingerprint } from "@/server/db/channel-schema";
import {
  type ListeningSourceConfig,
  listeningSourceTable,
} from "@/server/db/listening-schema";

// Loads the evolvable listening context (brand voice + story + per-source
// override/config) so the monitor services can compose their prompts and read
// their source config from the DB instead of hardcoded constants. The single
// Wander brand owns listening today; resolved by slug.

const LISTENING_BRAND_SLUG = "wander";

export interface ListeningContext {
  brandId: string | null;
  brandName: string | null;
  brandVoice: string | null; // brandFingerprint.fingerprintText
  story: BrandListeningStory | null;
  voiceOverride: ChannelFingerprint | null;
  signalNotes: string | null;
  sourceConfig: ListeningSourceConfig | null;
}

const EMPTY: ListeningContext = {
  brandId: null,
  brandName: null,
  brandVoice: null,
  story: null,
  voiceOverride: null,
  signalNotes: null,
  sourceConfig: null,
};

export async function loadListeningContext(
  adapter: string,
): Promise<ListeningContext> {
  const [brand] = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      brandFingerprint: brandTable.brandFingerprint,
      brandListeningStory: brandTable.brandListeningStory,
    })
    .from(brandTable)
    .where(eq(brandTable.slug, LISTENING_BRAND_SLUG))
    .limit(1);

  if (!brand) return EMPTY;

  const [source] = await db
    .select({
      voiceOverride: listeningSourceTable.voiceOverride,
      signalNotes: listeningSourceTable.signalNotes,
      config: listeningSourceTable.config,
    })
    .from(listeningSourceTable)
    .where(
      and(
        eq(listeningSourceTable.brandId, brand.id),
        eq(listeningSourceTable.adapter, adapter),
      ),
    )
    .limit(1);

  return {
    brandId: brand.id,
    brandName: brand.name,
    brandVoice: brand.brandFingerprint?.fingerprintText ?? null,
    story: brand.brandListeningStory ?? null,
    voiceOverride: source?.voiceOverride ?? null,
    signalNotes: source?.signalNotes ?? null,
    sourceConfig: source?.config ?? null,
  };
}
