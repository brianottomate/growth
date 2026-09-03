import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { AD_PLATFORM_SPECS, type AdAccountPlatform } from "@/lib/ad-platforms";
import { db } from "@/server/db";
import { adAccountTable, brandTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  isZernioConfigured,
  listZernioAccounts,
  listZernioAdAccounts,
  type ZernioAccount,
} from "@/server/clients/zernio.client";

// ---- BRAND AD ACCOUNTS: the allowlist gets its UI --------------------
//
// When a client completes the Meta/Google OAuth on /connect/[token], their
// token can reach every ad account they manage — other businesses included.
// Nothing is ingested until an operator explicitly allows an account here
// (ad_account is default-deny; see ad-account-allowlist.service.ts). This
// service is the brand-page surface for that decision: enumerate what the
// connection can see, record an allow or an explicit deny.

/** Zernio ads connection platform → ad_account.platform key, for every pushable platform. */
const CONNECTION_PLATFORMS: Record<string, AdAccountPlatform> =
  Object.fromEntries(
    AD_PLATFORM_SPECS.filter(
      (spec) => spec.stage === "push" && spec.zernio,
    ).flatMap((spec) =>
      spec.zernio!.connectionPlatforms.map((name) => [
        name,
        spec.zernio!.allowlistPlatform as AdAccountPlatform,
      ]),
    ),
  );

function zernioAccountProfileId(account: ZernioAccount): string | null {
  if (typeof account.profileId === "string") return account.profileId;
  return account.profileId?._id ?? null;
}

export type BrandAdAccount = {
  platform: AdAccountPlatform;
  externalId: string;
  name: string | null;
  /** null = no row yet (undecided); the allowlist treats that as deny. */
  allowed: boolean | null;
  /** Set when the account is already registered to a different brand. */
  ownedByBrand: string | null;
  /** False for rows that exist in the registry but no connection can see. */
  discovered: boolean;
};

/**
 * Everything the brand's ads connections can reach, merged with the registry.
 * Live Zernio enumeration; a connection that errors is skipped rather than
 * failing the page.
 */
export async function listBrandAdAccounts(
  brandId: string,
  options: { discover?: boolean } = {},
): Promise<BrandAdAccount[]> {
  const discover = options.discover ?? true;
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, zernioProfileId: true },
  });
  if (!brand) throw new Error("Brand not found");

  type Discovered = {
    platform: AdAccountPlatform;
    externalId: string;
    name: string | null;
  };
  const discovered: Discovered[] = [];

  // discover=false skips the live Zernio enumeration — the cheap path for
  // rendering what is already decided (the page); the dialog discovers.
  if (discover && brand.zernioProfileId && isZernioConfigured) {
    const connections = (await listZernioAccounts()).filter(
      (account) =>
        zernioAccountProfileId(account) === brand.zernioProfileId &&
        CONNECTION_PLATFORMS[account.platform?.toLowerCase() ?? ""],
    );
    const results = await Promise.allSettled(
      connections.map(async (connection) => {
        const accountId = connection._id ?? connection.id;
        if (!accountId) return [];
        const platform =
          CONNECTION_PLATFORMS[connection.platform.toLowerCase()]!;
        const reachable = await listZernioAdAccounts({
          accountId,
          limit: 500,
        });
        return reachable.map((adAccount) => ({
          platform,
          externalId: adAccount.id,
          name: adAccount.name ?? null,
        }));
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") discovered.push(...result.value);
      else console.error("brand ad-account enumeration failed", result.reason);
    }
  }

  const externalIds = [...new Set(discovered.map((row) => row.externalId))];
  const registryRows = await db.query.adAccountTable.findMany({
    where: or(
      eq(adAccountTable.brandId, brandId),
      externalIds.length > 0
        ? inArray(adAccountTable.externalId, externalIds)
        : undefined,
    ),
  });
  const foreignBrandIds = [
    ...new Set(
      registryRows
        .map((row) => row.brandId)
        .filter((id): id is string => Boolean(id) && id !== brandId),
    ),
  ];
  const foreignBrands =
    foreignBrandIds.length > 0
      ? await db.query.brandTable.findMany({
          where: inArray(brandTable.id, foreignBrandIds),
          columns: { id: true, name: true },
        })
      : [];

  const seen = new Set<string>();
  const merged: BrandAdAccount[] = discovered.map((row) => {
    seen.add(`${row.platform}:${row.externalId}`);
    const registry = registryRows.find(
      (candidate) =>
        candidate.platform === row.platform &&
        candidate.externalId === row.externalId,
    );
    const foreign =
      registry?.brandId && registry.brandId !== brandId
        ? (foreignBrands.find((b) => b.id === registry.brandId)?.name ??
          "another brand")
        : null;
    return {
      platform: row.platform,
      externalId: row.externalId,
      name: row.name ?? registry?.name ?? null,
      allowed: foreign ? false : (registry?.isAllowed ?? null),
      ownedByBrand: foreign,
      discovered: true,
    };
  });

  // Registry rows for this brand that no live connection reaches — kept
  // visible so a stale allow is a decision on screen, not a hidden grant.
  for (const registry of registryRows) {
    if (registry.brandId !== brandId) continue;
    const key = `${registry.platform}:${registry.externalId}`;
    if (seen.has(key)) continue;
    merged.push({
      platform: registry.platform as AdAccountPlatform,
      externalId: registry.externalId,
      name: registry.name,
      allowed: registry.isAllowed,
      ownedByBrand: null,
      discovered: false,
    });
  }

  return merged;
}

/**
 * Record the operator's decision. Never reassigns an account that belongs to
 * a different brand — that conflict has to be resolved deliberately, not by
 * a click on the wrong page.
 */
export async function setBrandAdAccountAllowed(input: {
  brandId: string;
  platform: AdAccountPlatform;
  externalId: string;
  name: string | null;
  isAllowed: boolean;
  decidedBy: string;
}) {
  const existing = await db.query.adAccountTable.findFirst({
    where: and(
      eq(adAccountTable.platform, input.platform),
      eq(adAccountTable.externalId, input.externalId),
    ),
  });

  const note = `${input.isAllowed ? "Allowed" : "Denied"} from the brand page by ${input.decidedBy}`;

  if (existing) {
    if (existing.brandId && existing.brandId !== input.brandId) {
      const owner = await db.query.brandTable.findFirst({
        where: eq(brandTable.id, existing.brandId),
        columns: { name: true },
      });
      throw new Error(
        `That ad account is registered to ${owner?.name ?? "another brand"}`,
      );
    }
    await db
      .update(adAccountTable)
      .set({
        brandId: input.brandId,
        isAllowed: input.isAllowed,
        name: input.name ?? existing.name,
        note,
      })
      .where(eq(adAccountTable.id, existing.id));
    return { updated: true };
  }

  await db.insert(adAccountTable).values({
    id: createId("adacct"),
    platform: input.platform,
    externalId: input.externalId,
    name: input.name,
    brandId: input.brandId,
    isAllowed: input.isAllowed,
    note,
  });
  return { updated: false };
}
