import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  personaTable,
  platformAudienceTable,
} from "@/server/db/schema";
import type { ZernioAudienceUser } from "@/server/clients/zernio.client";
import { PUSHABLE_AD_PLATFORMS } from "@/lib/ad-platforms";

import {
  addAdAudienceUsers,
  clearPersonaAssetOnPlatform,
  createAdAudience,
  listAdsWriteDestinations,
} from "./ads-write.service";

// ---- PERSONA AUDIENCES ------------------------------------------------------
//
// The Meta assets a persona is bought through: a customer list uploaded as a
// seed, and the lookalike Meta models from it. Personas stay the brand-level
// "who"; these rows are the platform "how", reused by every campaign audience
// derived from the persona (see platformAudienceExternalIdFor in the push).

type Context = { organizationId: string; runId: string };

/** Lookalike country when neither the operator nor the persona names one. */
export const DEFAULT_LOOKALIKE_COUNTRY = "US";

async function requirePersona(personaId: string, organizationId: string) {
  const [row] = await db
    .select({
      persona: personaTable,
      brand: {
        id: brandTable.id,
        slug: brandTable.slug,
        name: brandTable.name,
      },
    })
    .from(personaTable)
    .innerJoin(brandTable, eq(brandTable.id, personaTable.brandId))
    .where(
      and(
        eq(personaTable.id, personaId),
        eq(brandTable.organizationId, organizationId),
        isNull(personaTable.deletedAt),
        isNull(brandTable.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Persona not found in this organization");
  if (!row.brand.slug) throw new Error(`${row.brand.name} has no slug`);
  return {
    persona: row.persona,
    brand: { ...row.brand, slug: row.brand.slug },
  };
}

/**
 * The Meta ad account an audience is created in. Every brand currently runs
 * on the shared Wander account, so the first allowlisted destination is the
 * answer unless the caller names one.
 */
async function resolveMetaDestination(input: {
  organizationId: string;
  brandSlug: string;
  adAccountId?: string | null;
}) {
  const listed = await listAdsWriteDestinations({
    organizationId: input.organizationId,
    brandSlug: input.brandSlug,
    platform: "meta",
  });
  const destination = input.adAccountId
    ? listed.destinations.find((row) => row.adAccountId === input.adAccountId)
    : listed.destinations[0];
  if (!destination) {
    throw new Error(
      input.adAccountId
        ? `${input.adAccountId} is not an allowlisted Meta ad account for ${listed.brand.name}`
        : `${listed.brand.name} has no allowlisted Meta ad account. Allow one on the brand page first.`,
    );
  }
  return destination;
}

/**
 * Local mirror rows hang off the brand's Meta Ads channel. Checking before the
 * provider call matters: a created Meta audience with nowhere to mirror would
 * be an orphan we cannot upload into.
 */
async function requireMetaChannel(brandId: string, brandName: string) {
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brandId),
      eq(channelTable.platform, "meta_ads"),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!channel) {
    throw new Error(
      `${brandName} has no Meta Ads channel in Growth yet, so there is nowhere to keep the audience. Connect Meta Ads on the brand page first.`,
    );
  }
}

/** Trim, lowercase emails, drop empty rows and exact duplicates. */
export function normalizeSeedUsers(
  users: ZernioAudienceUser[],
): ZernioAudienceUser[] {
  const seen = new Set<string>();
  const out: ZernioAudienceUser[] = [];
  for (const user of users) {
    const email = user.email?.trim().toLowerCase() || undefined;
    const phone = user.phone?.trim() || undefined;
    if (!email && !phone) continue;
    const key = `${email ?? ""}|${phone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...(email ? { email } : {}), ...(phone ? { phone } : {}) });
  }
  return out;
}

/**
 * Create a Meta customer list for a persona and upload its members. The list
 * becomes the persona's Meta asset until a lookalike built from it takes over.
 */
export async function uploadPersonaSeedList(
  input: {
    personaId: string;
    users: ZernioAudienceUser[];
    name?: string;
    adAccountId?: string;
  },
  context: Context,
) {
  const { persona, brand } = await requirePersona(
    input.personaId,
    context.organizationId,
  );
  const users = normalizeSeedUsers(input.users);
  if (users.length === 0) {
    throw new Error("No rows with an email or phone to upload");
  }
  await requireMetaChannel(brand.id, brand.name);
  const destination = await resolveMetaDestination({
    organizationId: context.organizationId,
    brandSlug: brand.slug,
    adAccountId: input.adAccountId,
  });

  const created = await createAdAudience(
    {
      brandSlug: brand.slug,
      connectionAccountId: destination.connectionAccountId,
      adAccountId: destination.adAccountId,
      type: "customer_list",
      name:
        input.name?.trim() ||
        `${brand.name} · ${persona.name} · seed ${new Date().toISOString().slice(0, 10)}`,
      personaId: persona.id,
    },
    context,
  );
  if (!created.platformAudienceId) {
    throw new Error(
      "Meta created the list but Growth could not keep a record of it, so nothing was uploaded",
    );
  }

  try {
    const upload = await addAdAudienceUsers({
      organizationId: context.organizationId,
      platformAudienceId: created.platformAudienceId,
      users,
    });
    return {
      platformAudienceId: created.platformAudienceId,
      adAccountId: destination.adAccountId,
      uploaded: upload.uploaded,
      total: upload.total,
    };
  } catch (error) {
    // The list exists on Meta now; name it so the upload can be resumed with
    // addAudienceUsers instead of creating a second list.
    throw new Error(
      `List ${created.platformAudienceId} was created but the upload failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Build a lookalike from a persona's seed list and make it the persona's Meta
 * asset. Country falls back to the persona's demand geography, then the US.
 */
export async function createPersonaLookalike(
  input: {
    seedPlatformAudienceId: string;
    personaId?: string;
    ratio?: number;
    country?: string;
  },
  context: Context,
) {
  const seed = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, input.seedPlatformAudienceId),
  });
  if (!seed) throw new Error("Seed audience not found");
  const personaId = input.personaId ?? seed.personaId;
  if (!personaId) {
    throw new Error("Name the persona this lookalike is for");
  }
  const { persona, brand } = await requirePersona(
    personaId,
    context.organizationId,
  );
  if (seed.brandId !== brand.id) {
    throw new Error("That seed belongs to a different brand");
  }
  if (!seed.externalId) {
    throw new Error(
      "The seed has no Meta id yet. Refresh audiences and try again.",
    );
  }

  const ratio = input.ratio ?? 0.01;
  const country = (input.country ?? DEFAULT_LOOKALIKE_COUNTRY).toUpperCase();
  const seedAccount = (seed.definition as { adAccountId?: unknown } | null)
    ?.adAccountId;
  const destination = await resolveMetaDestination({
    organizationId: context.organizationId,
    brandSlug: brand.slug,
    adAccountId: typeof seedAccount === "string" ? seedAccount : null,
  });

  const created = await createAdAudience(
    {
      brandSlug: brand.slug,
      connectionAccountId: destination.connectionAccountId,
      adAccountId: destination.adAccountId,
      type: "lookalike",
      name: `${brand.name} · ${persona.name} · ${Math.round(ratio * 100)}% ${country} lookalike`,
      sourceAudienceId: seed.externalId,
      country,
      ratio,
      personaId: persona.id,
    },
    context,
  );
  return {
    platformAudienceId: created.platformAudienceId,
    adAccountId: destination.adAccountId,
    country,
    ratio,
  };
}

/**
 * Point a persona at an asset already in the ad account (or clear it with
 * null). Local rows only; the platform audience itself is untouched.
 */
export async function assignPersonaAudience(input: {
  organizationId: string;
  platformAudienceId: string;
  personaId: string | null;
}) {
  const [row] = await db
    .select({
      asset: platformAudienceTable,
      platform: channelTable.platform,
      organizationId: brandTable.organizationId,
    })
    .from(platformAudienceTable)
    .innerJoin(brandTable, eq(brandTable.id, platformAudienceTable.brandId))
    .innerJoin(
      channelTable,
      eq(channelTable.id, platformAudienceTable.channelId),
    )
    .where(eq(platformAudienceTable.id, input.platformAudienceId))
    .limit(1);
  if (!row || row.organizationId !== input.organizationId) {
    throw new Error("Audience not found in this organization");
  }
  if (input.personaId) {
    const { brand } = await requirePersona(
      input.personaId,
      input.organizationId,
    );
    if (brand.id !== row.asset.brandId) {
      throw new Error("That persona belongs to a different brand");
    }
    const platform = PUSHABLE_AD_PLATFORMS.find((key) => key === row.platform);
    if (platform) await clearPersonaAssetOnPlatform(input.personaId, platform);
  }
  const [updated] = await db
    .update(platformAudienceTable)
    .set({ personaId: input.personaId })
    .where(eq(platformAudienceTable.id, row.asset.id))
    .returning({
      id: platformAudienceTable.id,
      name: platformAudienceTable.name,
      personaId: platformAudienceTable.personaId,
    });
  return updated!;
}

export type PersonaAudienceAsset = {
  id: string;
  name: string;
  type: string;
  source: string;
  sizeLabel: string | null;
  externalId: string | null;
  platform: string;
  createdAt: Date;
};

/**
 * The brand's personas with the asset each one is bought through and that
 * asset's seed, plus what sits in the ad account unassigned.
 */
export async function loadPersonaAudiences(brandId: string) {
  const [personas, rows] = await Promise.all([
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, brandId),
        isNull(personaTable.deletedAt),
      ),
      orderBy: [asc(personaTable.createdAt)],
    }),
    db
      .select({
        id: platformAudienceTable.id,
        name: platformAudienceTable.name,
        type: platformAudienceTable.type,
        source: platformAudienceTable.source,
        sizeLabel: platformAudienceTable.sizeLabel,
        externalId: platformAudienceTable.externalId,
        sourceId: platformAudienceTable.sourceId,
        personaId: platformAudienceTable.personaId,
        audienceId: platformAudienceTable.audienceId,
        platform: channelTable.platform,
        createdAt: platformAudienceTable.createdAt,
      })
      .from(platformAudienceTable)
      .innerJoin(
        channelTable,
        eq(channelTable.id, platformAudienceTable.channelId),
      )
      .where(eq(platformAudienceTable.brandId, brandId))
      .orderBy(asc(platformAudienceTable.name)),
  ]);

  const byExternalId = new Map(
    rows.flatMap((row) => (row.externalId ? [[row.externalId, row]] : [])),
  );
  const shown = new Set<string>();
  const asset = (row: (typeof rows)[number]): PersonaAudienceAsset => {
    shown.add(row.id);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      source: row.source,
      sizeLabel: row.sizeLabel,
      externalId: row.externalId,
      platform: row.platform,
      createdAt: row.createdAt,
    };
  };

  const withAssets = personas.map((persona) => {
    const targets = rows
      .filter((row) => row.personaId === persona.id)
      .map((row) => {
        const seed = row.sourceId ? byExternalId.get(row.sourceId) : undefined;
        return { asset: asset(row), seed: seed ? asset(seed) : null };
      });
    return { persona, targets };
  });
  const unassigned = rows
    .filter((row) => !shown.has(row.id) && !row.audienceId)
    .map(asset);

  return { personas: withAssets, unassigned };
}
