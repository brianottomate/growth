import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  campaignTable,
  channelTable,
  initiativeTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { getAllowedAdAccountIds } from "@/server/services/ad-account-allowlist.service";

// ---- FIRST-PARTY CAMPAIGN DRAFTS --------------------------------------
//
// A draft campaign is a local `campaign` row with no `externalId`: the
// editable object that chat and the campaign canvas work on before anything
// touches a provider. Launching (creating it on the platform) is a separate,
// operator-approved step — drafting is free and reversible.

export type DraftAdPlatform = "meta_ads" | "google_ads";

/**
 * The channel a draft hangs on: the brand's ad channel for the platform,
 * preferring one bound to an allowed ad account (that is where a launch
 * would land). Creates a placeholder channel when the brand has none yet,
 * matching how ads-sync handles never-before-seen accounts.
 */
async function resolveDraftChannel(
  brand: { id: string; name: string },
  platform: DraftAdPlatform,
): Promise<string> {
  const channels = await db.query.channelTable.findMany({
    where: and(
      eq(channelTable.brandId, brand.id),
      eq(channelTable.platform, platform),
      eq(channelTable.kind, "ad"),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true, externalId: true },
  });
  if (channels.length > 0) {
    const allowed = await getAllowedAdAccountIds(brand.id);
    const sameAccount = (a: string, b: string) =>
      a.replace(/^act_/, "") === b.replace(/^act_/, "");
    const bound = channels.find(
      (channel) =>
        channel.externalId &&
        [...allowed].some((id) => sameAccount(id, channel.externalId!)),
    );
    return (bound ?? channels[0]!).id;
  }
  // Placeholder until a real ad account is allowed and synced — must not
  // render as a connected channel.
  const [created] = await db
    .insert(channelTable)
    .values({
      id: createId("chan"),
      brandId: brand.id,
      kind: "ad",
      platform,
      displayName: brand.name,
      connectionStatus: "disconnected",
    })
    .returning({ id: channelTable.id });
  return created!.id;
}

/** An initiative id from a caller is only trusted after it maps to the brand. */
async function assertInitiativeBelongsToBrand(
  initiativeId: string,
  brandId: string,
) {
  const initiative = await db.query.initiativeTable.findFirst({
    where: eq(initiativeTable.id, initiativeId),
    columns: { brandId: true },
  });
  if (!initiative || initiative.brandId !== brandId) {
    throw new Error("That initiative does not belong to this brand");
  }
}

export async function createDraftCampaign(input: {
  organizationId: string;
  /** One of brandId / brandSlug is required. */
  brandId?: string;
  brandSlug?: string;
  name: string;
  platform: DraftAdPlatform;
  objective?: string | null;
  /** Whole dollars, total intended for the campaign. */
  budget?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
  initiativeId?: string | null;
}) {
  if (!input.brandId && !input.brandSlug) {
    throw new Error("brandId or brandSlug is required");
  }
  const brand = await db.query.brandTable.findFirst({
    where: and(
      input.brandId
        ? eq(brandTable.id, input.brandId)
        : and(
            eq(brandTable.slug, input.brandSlug!),
            eq(brandTable.organizationId, input.organizationId),
          ),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, organizationId: true },
  });
  if (!brand || brand.organizationId !== input.organizationId) {
    throw new Error("No access to this brand");
  }

  if (input.initiativeId) {
    await assertInitiativeBelongsToBrand(input.initiativeId, brand.id);
  }

  const channelId = await resolveDraftChannel(brand, input.platform);
  const [campaign] = await db
    .insert(campaignTable)
    .values({
      id: createId("camp"),
      channelId,
      brandId: brand.id,
      platform: input.platform,
      initiativeId: input.initiativeId ?? null,
      name: input.name,
      status: "draft",
      objective: input.objective ?? null,
      budget: input.budget ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    })
    .returning();

  return {
    campaign: campaign!,
    brandSlug: brand.slug,
    path: `/app/brands/${brand.slug}/ads/${campaign!.id}`,
  };
}

/**
 * Adopt a campaign (usually a synced, unlinked one) into the first-party
 * intent layer: attach it to an initiative, minting the initiative when a
 * name is given instead of an id.
 */
export async function linkCampaignToInitiative(input: {
  organizationId: string;
  campaignId: string;
  initiativeId?: string | null;
  newInitiativeName?: string | null;
}) {
  const campaign = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, input.campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
    columns: { id: true, organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this campaign");
  }

  let initiativeId = input.initiativeId ?? null;
  if (initiativeId) {
    await assertInitiativeBelongsToBrand(initiativeId, brand.id);
  }
  if (!initiativeId && input.newInitiativeName?.trim()) {
    const [initiative] = await db
      .insert(initiativeTable)
      .values({
        id: createId("init"),
        brandId: brand.id,
        name: input.newInitiativeName.trim(),
        status: "active",
      })
      .returning({ id: initiativeTable.id });
    initiativeId = initiative!.id;
  }

  const [updated] = await db
    .update(campaignTable)
    .set({ initiativeId })
    .where(eq(campaignTable.id, campaign.id))
    .returning({ id: campaignTable.id, initiativeId: campaignTable.initiativeId });
  return updated!;
}

/** The brand's initiatives, newest first — the picker's options. */
export async function listBrandInitiatives(input: {
  organizationId: string;
  brandId: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this brand");
  }
  return db.query.initiativeTable.findMany({
    where: eq(initiativeTable.brandId, input.brandId),
    orderBy: [desc(initiativeTable.createdAt)],
    columns: { id: true, name: true, status: true },
  });
}
