import { adsConnectionProfile } from "./ads-connection-profile";
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
//
// An account can be allowed for several brands. A Performance client runs
// from Wander's ad account as its own Page, so allowing Wander's account on
// the client's brand writes a SHARED row: sync then attributes the client
// only the campaigns this app pushed for it (see ads-sync.service).

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
  /**
   * Another brand owns this account. Allowing it here shares it: the brand
   * runs from it and is attributed only what this app pushes for it.
   */
  sharedFrom: string | null;
  /** False for rows that exist in the registry but no connection can see. */
  discovered: boolean;
};

/**
 * Everything the brand's ads connections can reach, merged with the registry.
 * Live Zernio enumeration; a connection that errors is skipped rather than
 * failing the page. A brand with no Zernio profile of its own enumerates
 * through every connection in the workspace, since a client without a
 * connection is exactly the one that will borrow Wander's account.
 */
export async function listBrandAdAccounts(
  brandId: string,
  options: { discover?: boolean } = {},
): Promise<BrandAdAccount[]> {
  const discover = options.discover ?? true;
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: {
      id: true,
      zernioProfileId: true,
      organizationId: true,
      performanceSettings: true,
    },
  });
  if (!brand) throw new Error("Brand not found");
  const profileId = await adsConnectionProfile(brand);

  type Discovered = {
    platform: AdAccountPlatform;
    externalId: string;
    name: string | null;
  };
  const discovered: Discovered[] = [];

  // discover=false skips the live Zernio enumeration — the cheap path for
  // rendering what is already decided (the page); the dialog discovers.
  if (discover && isZernioConfigured) {
    const connections = (await listZernioAccounts()).filter(
      (account) =>
        (!profileId || zernioAccountProfileId(account) === profileId) &&
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

  const ownRow = (platform: string, externalId: string) =>
    registryRows.find(
      (row) =>
        row.platform === platform &&
        row.externalId === externalId &&
        row.brandId === brandId,
    );
  // The account's owner: the brand allowed on it without borrowing it.
  const ownerOf = (platform: string, externalId: string) => {
    const owner = registryRows.find(
      (row) =>
        row.platform === platform &&
        row.externalId === externalId &&
        row.brandId &&
        row.brandId !== brandId &&
        row.isAllowed &&
        !row.isShared,
    );
    return owner
      ? (foreignBrands.find((b) => b.id === owner.brandId)?.name ??
          "another brand")
      : null;
  };

  const seen = new Set<string>();
  const merged: BrandAdAccount[] = [];
  const dedupedDiscovered = discovered.filter((row) => {
    const key = `${row.platform}:${row.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const row of dedupedDiscovered) {
    const registry = ownRow(row.platform, row.externalId);
    // An unbranded denial (a foreign account nobody claims) is a decision too.
    const unbranded = registryRows.find(
      (candidate) =>
        candidate.platform === row.platform &&
        candidate.externalId === row.externalId &&
        candidate.brandId === null,
    );
    merged.push({
      platform: row.platform,
      externalId: row.externalId,
      name: row.name ?? registry?.name ?? unbranded?.name ?? null,
      allowed: registry ? registry.isAllowed : unbranded ? false : null,
      sharedFrom: ownerOf(row.platform, row.externalId),
      discovered: true,
    });
  }

  // Registry rows for this brand that no live connection reaches — kept
  // visible so a stale allow is a decision on screen, not a hidden grant.
  for (const registry of registryRows) {
    if (registry.brandId !== brandId) continue;
    const key = `${registry.platform}:${registry.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      platform: registry.platform as AdAccountPlatform,
      externalId: registry.externalId,
      name: registry.name,
      allowed: registry.isAllowed,
      sharedFrom: ownerOf(registry.platform, registry.externalId),
      discovered: false,
    });
  }

  return merged;
}

/**
 * Record the operator's decision for THIS brand. An account another brand
 * already owns is allowed as a shared row, so the brand runs from it without
 * taking it over; an unbranded denial record is adopted rather than doubled.
 */
export async function setBrandAdAccountAllowed(input: {
  brandId: string;
  platform: AdAccountPlatform;
  externalId: string;
  name: string | null;
  isAllowed: boolean;
  decidedBy: string;
}) {
  const rows = await db.query.adAccountTable.findMany({
    where: and(
      eq(adAccountTable.platform, input.platform),
      eq(adAccountTable.externalId, input.externalId),
    ),
  });
  const own = rows.find((row) => row.brandId === input.brandId);
  const unbranded = rows.find((row) => row.brandId === null);
  const ownedElsewhere = rows.some(
    (row) =>
      row.brandId &&
      row.brandId !== input.brandId &&
      row.isAllowed &&
      !row.isShared,
  );

  const note = `${input.isAllowed ? "Allowed" : "Denied"}${
    ownedElsewhere && input.isAllowed ? " (shared)" : ""
  } from the brand page by ${input.decidedBy}`;

  const existing = own ?? unbranded;
  if (existing) {
    await db
      .update(adAccountTable)
      .set({
        brandId: input.brandId,
        isAllowed: input.isAllowed,
        isShared: ownedElsewhere,
        name: input.name ?? existing.name,
        note,
      })
      .where(eq(adAccountTable.id, existing.id));
    return { updated: true, shared: ownedElsewhere };
  }

  await db.insert(adAccountTable).values({
    id: createId("adacct"),
    platform: input.platform,
    externalId: input.externalId,
    name: input.name,
    brandId: input.brandId,
    isAllowed: input.isAllowed,
    isShared: ownedElsewhere,
    note,
  });
  return { updated: false, shared: ownedElsewhere };
}
