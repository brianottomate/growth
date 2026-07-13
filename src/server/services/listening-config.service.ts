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
// their source config from the DB instead of hardcoded constants. The source is
// the binding to its owned brand; there is no global hardcoded listening brand.

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
  const [row] = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      brandFingerprint: brandTable.brandFingerprint,
      brandListeningStory: brandTable.brandListeningStory,
      voiceOverride: listeningSourceTable.voiceOverride,
      signalNotes: listeningSourceTable.signalNotes,
      config: listeningSourceTable.config,
    })
    .from(listeningSourceTable)
    .innerJoin(brandTable, eq(listeningSourceTable.brandId, brandTable.id))
    .where(
      and(
        eq(listeningSourceTable.adapter, adapter),
        eq(brandTable.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return EMPTY;

  return {
    brandId: row.id,
    brandName: row.name,
    brandVoice: row.brandFingerprint?.fingerprintText ?? null,
    story: row.brandListeningStory ?? null,
    voiceOverride: row.voiceOverride ?? null,
    signalNotes: row.signalNotes ?? null,
    sourceConfig: row.config ?? null,
  };
}
