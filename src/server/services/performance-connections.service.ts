import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { adAccountTable, brandTable } from "@/server/db/schema";
import {
  isZernioConfigured,
  listZernioAccounts,
  listZernioAdAccounts,
  type ZernioAdAccount,
} from "@/server/clients/zernio.client";
import {
  sameAdAccountId,
  zernioConnectionMatchesPlatform,
} from "@/lib/zernio-ads";
import type { PerformanceConnectionSummary } from "@/lib/performance-connections";
import {
  metaAdBillingStatus,
  metaBillingIssueKey,
  type MetaAdBillingStatus,
} from "@/lib/meta-ad-billing";

export async function sitePixels(
  website: string | null,
  websiteId: string | null,
) {
  if (!website || !websiteId) return { ids: null, customerId: null };
  try {
    const [page, config] = await Promise.all([
      fetch(website, {
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 300 },
      }),
      fetch(
        `https://api.wander.com/saas/website/${encodeURIComponent(websiteId)}`,
        { signal: AbortSignal.timeout(5000), next: { revalidate: 300 } },
      ),
    ]);
    const settings = config.ok
      ? ((await config.json()) as { metaPixelId?: string | null })
      : null;
    if (!page.ok)
      return { ids: null, customerId: settings?.metaPixelId ?? null };
    const html = await page.text();
    const json =
      /<script\b[^>]*\bid=["']site-trackers["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      )?.[1];
    const trackers: unknown = json ? JSON.parse(json) : null;
    const ids =
      trackers &&
      typeof trackers === "object" &&
      "metaPixelIds" in trackers &&
      Array.isArray(trackers.metaPixelIds)
        ? trackers.metaPixelIds.filter(
            (id): id is string => typeof id === "string" && /^\d+$/.test(id),
          )
        : null;
    return { ids, customerId: settings?.metaPixelId ?? null };
  } catch (error) {
    console.error("Could not inspect Performance site pixels", {
      websiteId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { ids: null, customerId: null };
  }
}

/** Provider health, explicit destination/allowlist, and published site evidence. */
export async function loadPerformanceConnections(
  orgId: string,
  brandIds: string[],
) {
  if (!brandIds.length) return new Map<string, PerformanceConnectionSummary>();
  const [brands, allowed, accounts] = await Promise.all([
    db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: {
        id: true,
        name: true,
        relationship: true,
        zernioProfileId: true,
        metaPageId: true,
        performanceSettings: true,
        website: true,
        wanderOsWebsiteId: true,
      },
    }),
    db.query.adAccountTable.findMany({
      where: and(
        inArray(adAccountTable.brandId, brandIds),
        eq(adAccountTable.platform, "facebook"),
        eq(adAccountTable.isAllowed, true),
      ),
      columns: { brandId: true, externalId: true, isShared: true },
    }),
    isZernioConfigured
      ? listZernioAccounts().catch((error) => {
          console.error("Performance connection health unavailable", error);
          return null;
        })
      : null,
  ]);
  const selected = new Set(brandIds);
  // Several clients can explicitly share one destination. Share the read only
  // within this load; never cache billing readiness across page loads/handoffs.
  const destinationReads = new Map<string, Promise<ZernioAdAccount[]>>();
  const entries = await Promise.all(
    brands
      .filter((brand) => selected.has(brand.id))
      .map(async (brand) => {
        const settings = brand.performanceSettings;
        const managerId = settings?.adsConnectionBrandId;
        const owner = managerId
          ? brands.find((row) => row.id === managerId)
          : brand;
        const shared = Boolean(managerId && managerId !== brand.id);
        const destination = settings?.metaAdsDestination;
        const connection = accounts?.find(
          (account) =>
            Boolean(owner?.zernioProfileId) &&
            (account._id ?? account.id) === destination?.connectionAccountId &&
            (typeof account.profileId === "string"
              ? account.profileId
              : account.profileId?._id) === owner?.zernioProfileId &&
            zernioConnectionMatchesPlatform("meta", account.platform),
        );
        const usable =
          connection &&
          connection.isActive !== false &&
          connection.enabled !== false &&
          !["error", "expired", "disconnected"].includes(
            String(connection.platformStatus),
          );
        const allowedAccount =
          destination &&
          allowed.find(
            (account) =>
              account.brandId === brand.id &&
              sameAdAccountId(
                "meta",
                account.externalId,
                destination.adAccountId,
              ),
          );
        let meta: PerformanceConnectionSummary["meta"] = !accounts
          ? "unknown"
          : connection && !usable
            ? "reconnect"
            : usable && allowedAccount && brand.metaPageId
              ? "ready"
              : "incomplete";
        const pixelId = destination
          ? (settings?.metaTrackingDefaults?.[destination.adAccountId]
              ?.pixelId ??
            owner?.performanceSettings?.metaTrackingDefaults?.[
              destination.adAccountId
            ]?.pixelId ??
            null)
          : null;
        const billingIssue = destination
          ? (settings?.metaBillingIssues?.[
              metaBillingIssueKey(destination.adAccountId)
            ] ?? null)
          : null;
        const billingRead = async (): Promise<MetaAdBillingStatus> => {
          if (!destination) return "not_selected";
          // Read only the explicit, brand-allowlisted destination through its owner.
          if (!usable || !allowedAccount) return "unknown";
          try {
            const key = JSON.stringify([
              destination.connectionAccountId,
              destination.adAccountId.replace(/^act_/, ""),
            ]);
            let read = destinationReads.get(key);
            if (!read) {
              read = listZernioAdAccounts({
                accountId: destination.connectionAccountId,
                adAccountId: destination.adAccountId,
              });
              destinationReads.set(key, read);
            }
            const rows = await read;
            const account = rows.find((row) =>
              sameAdAccountId("meta", row.id, destination.adAccountId),
            );
            if (account?.selectable === false) meta = "blocked";
            return account
              ? metaAdBillingStatus(account, billingIssue)
              : "unknown";
          } catch (error) {
            console.error("Performance ad billing unavailable", {
              brandId: brand.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            return "unknown";
          }
        };
        const [site, billingSeen] = await Promise.all([
          sitePixels(brand.website, brand.wanderOsWebsiteId),
          billingRead(),
        ]);
        // Meta refusing a push outranks whatever the billing read could see.
        const billing = billingIssue ? "payment_issue" : billingSeen;
        const summary: PerformanceConnectionSummary = {
          profile: brand.zernioProfileId ? "connected" : "missing",
          meta,
          billing,
          billingIssueAt: billingIssue?.at ?? null,
          route: `${shared ? `Via ${owner?.name ?? "unavailable manager"}` : "Client connection"} · ${allowedAccount ? (allowedAccount.isShared ? "Shared ad account" : "Own ad account") : "Ad account not selected"}`,
          clientSetupComplete: Boolean(
            brand.zernioProfileId &&
            !shared &&
            meta === "ready" &&
            billing === "present",
          ),
          pixelId,
          sitePixelIds: site.ids,
          customerPixelId: site.customerId,
        };
        return [brand.id, summary] as const;
      }),
  );
  return new Map(entries);
}
