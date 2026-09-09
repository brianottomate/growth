import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { adAccountTable } from "@/server/db/schema";

/**
 * Ad-account allowlist — the durable, default-DENY registry of which external
 * ad accounts aggregator reads (Zernio today) may consume.
 *
 * Why: aggregators connect to Meta/LinkedIn/etc. through a HUMAN's OAuth, so
 * the token sees every ad account that person manages — the 2026-07-10 probe
 * found Kristian's personal "Homi" account inside Wander's Zernio metaads
 * connection, and Zernio's /ads/tree ignores its own scope filter. Filtering
 * here guarantees personal/unknown accounts can never pollute Wander numbers,
 * regardless of aggregator behavior.
 *
 * Rows live in Neon `ad_account` (see db/ad-account-schema.ts); manage them
 * with `bun run scripts/seed-ad-accounts.ts` or Drizzle Studio.
 */

/** Allowed account IDs for one explicit owned brand. */
export async function getAllowedAdAccountIds(
  brandId: string,
): Promise<Set<string>> {
  const rows = await getAllowedAdAccounts(brandId);
  return new Set(rows.map((r) => r.externalId));
}

/**
 * Allowed accounts for one brand with the borrow flag. A shared row means
 * the brand runs from another brand's account and may only be attributed the
 * campaigns this app pushed for it.
 */
export async function getAllowedAdAccounts(
  brandId: string,
): Promise<Array<{ externalId: string; isShared: boolean }>> {
  return db
    .select({
      externalId: adAccountTable.externalId,
      isShared: adAccountTable.isShared,
    })
    .from(adAccountTable)
    .where(
      and(
        eq(adAccountTable.isAllowed, true),
        eq(adAccountTable.brandId, brandId),
      ),
    );
}

/** Operational sync may ingest every explicitly allowed owned account. */
export async function getAllAllowedAdAccountIds(): Promise<Set<string>> {
  const rows = await db
    .select({ externalId: adAccountTable.externalId })
    .from(adAccountTable)
    .where(eq(adAccountTable.isAllowed, true));
  return new Set(rows.map((row) => row.externalId));
}

/**
 * Filter aggregator items to allowed ad accounts (default-deny) and log what
 * was dropped so a newly-appearing account is visible, not silent.
 *
 * Items without an ad-account id are KEPT — some Zernio objects (organic
 * posts, X ads) don't carry one; the deny stance is about foreign ad
 * accounts, not missing metadata.
 */
export function filterToAllowedAdAccounts<T extends object>(
  items: T[],
  allowed: Set<string>,
  context: string,
  keepUnscoped = true,
): T[] {
  const dropped = new Map<string, number>();
  const kept: T[] = [];
  for (const item of items) {
    const rec = item as Record<string, unknown>;
    const id = rec.platformAdAccountId;
    if (typeof id !== "string" || id.length === 0) {
      if (keepUnscoped) kept.push(item);
      else
        dropped.set(
          "(missing account id)",
          (dropped.get("(missing account id)") ?? 0) + 1,
        );
      continue;
    }
    if (allowed.has(id)) {
      kept.push(item);
      continue;
    }
    const name =
      typeof rec.platformAdAccountName === "string"
        ? rec.platformAdAccountName
        : "(unnamed)";
    dropped.set(`${id} ${name}`, (dropped.get(`${id} ${name}`) ?? 0) + 1);
  }
  if (dropped.size > 0) {
    console.warn(
      `[AdAccountAllowlist] ${context}: dropped items from non-allowed ad accounts:`,
      Object.fromEntries(dropped),
    );
  }
  return kept;
}
