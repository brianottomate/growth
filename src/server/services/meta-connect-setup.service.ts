import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  adAccountTable,
  brandTable,
  brandTaskTable,
  workflowRunTable,
} from "@/server/db/schema";
import {
  createZernioMetaPixel,
  listZernioAccounts,
  listZernioAdAccounts,
  listZernioFacebookPages,
  listZernioPixels,
} from "@/server/clients/zernio.client";
import { selectMetaSetupAccount } from "@/lib/meta-setup-selection";
import { metaAdBillingStatus } from "@/lib/meta-ad-billing";
import { sameAdAccountId } from "@/lib/zernio-ads";
import { sitePixels } from "./performance-connections.service";

/** This is a provider-write receipt, not a cached pixel. An interrupted create
 * is never replayed, even after its worker expires or fails.
 */
async function createPixelOnce(input: {
  brandId: string;
  organizationId: string;
  connectionAccountId: string;
  adAccountId: string;
  name: string;
}) {
  const lockKey = `meta-pixel:${input.brandId}:${input.adAccountId}`;
  const receipt = await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const existing = await tx.query.workflowRunTable.findFirst({
      where: and(
        eq(workflowRunTable.brandId, input.brandId),
        eq(workflowRunTable.lockKey, lockKey),
      ),
    });
    if (existing) return { run: existing, created: false };
    const [run] = await tx
      .insert(workflowRunTable)
      .values({
        brandId: input.brandId,
        organizationId: input.organizationId,
        workflowType: "meta-pixel-create",
        operation: "create",
        provider: "zernio",
        lockKey,
        input,
        status: "running",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 20 * 60_000),
      })
      .returning();
    return { run: run!, created: true };
  });
  if (!receipt.created) {
    throw new Error(
      "A pixel creation was already attempted. Check Meta before creating another pixel.",
    );
  }
  try {
    const pixel = await createZernioMetaPixel(input);
    await db
      .update(workflowRunTable)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        providerOutput: { pixelId: pixel.id },
      })
      .where(eq(workflowRunTable.id, receipt.run.id));
    return pixel.id;
  } catch (error) {
    await db
      .update(workflowRunTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Pixel creation failed",
      })
      .where(eq(workflowRunTable.id, receipt.run.id));
    throw error;
  }
}

/** Complete the client's own Meta authorization. Discovery is used only for
 * account selection; account data/tracking reads follow an explicit allow.
 * Called on the Meta callback, never on ordinary page reads.
 */
export async function completeMetaConnectSetup(brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand?.organizationId || !brand.zernioProfileId) return;
  const organizationId = brand.organizationId;
  const task = async (
    key: string,
    title: string,
    notes: string,
    billing = false,
  ) => {
    const last = await db.query.brandTaskTable.findFirst({
      where: eq(brandTaskTable.brandId, brandId),
      orderBy: (t, { desc }) => [desc(t.sortOrder)],
      columns: { sortOrder: true },
    });
    await db
      .insert(brandTaskTable)
      .values({
        brandId,
        templateKey: `meta-setup:${key}`,
        title,
        notes,
        category: billing ? "billing" : "ads_infrastructure",
        tags: billing
          ? ["meta", "billing"]
          : ["meta", "tracking", "client access"],
        assigneeUserId: brand.csLeadId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      })
      .onConflictDoNothing({
        target: [brandTaskTable.brandId, brandTaskTable.templateKey],
      });
  };
  try {
    const profileAccounts = (await listZernioAccounts()).filter(
      (a) =>
        (typeof a.profileId === "string" ? a.profileId : a.profileId?._id) ===
        brand.zernioProfileId,
    );
    const connections = profileAccounts.filter(
      (a) =>
        a.platform === "metaads" &&
        a.enabled !== false &&
        a.isActive !== false &&
        !["error", "expired", "disconnected"].includes(
          String(a.platformStatus).toLowerCase(),
        ),
    );
    if (connections.length !== 1) {
      await task(
        "connection",
        "Review Meta account connection",
        "The client's profile does not have exactly one active Meta Ads connection. Review Connections in client settings.",
      );
      return;
    }
    const connection = connections[0]!;
    const connectionAccountId = connection._id ?? connection.id;
    if (!connectionAccountId) throw new Error("Meta connection has no ID");
    const facebook = profileAccounts.find(
      (a) =>
        a.platform === "facebook" &&
        a.platformUserId === connection.platformUserId,
    );
    const facebookId = facebook?._id ?? facebook?.id;
    if (!facebookId)
      throw new Error(
        "The Meta connection has no matching Facebook Page connection",
      );
    const page = await listZernioFacebookPages({
      accountId: facebookId,
      refresh: true,
    });
    const pageId = page.selectedPageId;
    if (
      !pageId ||
      !page.pages.some((p) => p.id === pageId) ||
      (brand.metaPageId && brand.metaPageId !== pageId)
    ) {
      await task(
        "page",
        "Confirm the client's Facebook Page",
        "The connected Page is missing or differs from the client's saved Page. Select the correct Page before preparing ads.",
      );
      return;
    }
    if (!brand.metaPageId) {
      await db
        .update(brandTable)
        .set({ metaPageId: pageId })
        .where(eq(brandTable.id, brandId));
    }
    const accounts = await listZernioAdAccounts({
      accountId: connectionAccountId,
      limit: 1000,
    });
    const registry = await db.query.adAccountTable.findMany({
      where: eq(adAccountTable.platform, "facebook"),
    });
    const blockedIds = registry
      .filter((a) => !a.isAllowed || (a.brandId !== brandId && !a.isShared))
      .map((a) => a.externalId);
    const chosenAccounts = registry.filter(
      (a) =>
        a.brandId === brandId &&
        a.isAllowed &&
        !a.isShared &&
        accounts.some((candidate) =>
          sameAdAccountId("meta", candidate.id, a.externalId),
        ),
    );
    const account = selectMetaSetupAccount(
      accounts,
      brand.performanceSettings?.metaAdsDestination?.adAccountId ??
        (chosenAccounts.length === 1
          ? chosenAccounts[0]!.externalId
          : undefined),
      blockedIds,
    );
    if (!account) {
      await task(
        "account",
        "Confirm the Meta ad account for this client",
        `Meta authorization succeeded, but no unambiguous account is selected. Available accounts: ${accounts.map((a) => `${a.name ?? a.id} (${a.id})`).join(", ") || "none"}. Select the client's account in settings; do not use another client's account.`,
      );
      return;
    }
    // The callback's sole reachable account (or a previously selected account)
    // becomes the explicit brand allowlist entry before any tracking reads.
    await db
      .insert(adAccountTable)
      .values({
        brandId,
        platform: "facebook",
        externalId: account.id,
        name: account.name,
        isAllowed: true,
        isShared: false,
        note: "Selected from the client's own Meta authorization",
      })
      .onConflictDoNothing({
        target: [
          adAccountTable.brandId,
          adAccountTable.platform,
          adAccountTable.externalId,
        ],
      });
    const allowed = await db.query.adAccountTable.findFirst({
      where: and(
        eq(adAccountTable.brandId, brandId),
        eq(adAccountTable.platform, "facebook"),
        eq(adAccountTable.externalId, account.id),
        eq(adAccountTable.isAllowed, true),
        eq(adAccountTable.isShared, false),
      ),
      columns: { id: true },
    });
    if (!allowed)
      throw new Error("The selected ad account is not allowed for this client");
    await db
      .update(brandTable)
      .set({
        performanceSettings: sql`(coalesce(${brandTable.performanceSettings}, '{}'::jsonb) - 'adsConnectionBrandId') || ${JSON.stringify({ metaAdsDestination: { connectionAccountId, adAccountId: account.id } })}::jsonb`,
      })
      .where(eq(brandTable.id, brandId));
    const billing = metaAdBillingStatus(account);
    if (billing !== "present")
      await task(
        `billing:${account.id}`,
        "Confirm Meta ad account billing",
        `${account.name ?? account.id}: ${billing}. Have the client add or fix their payment method, or grant billing visibility in Meta. A connected account alone does not confirm payment readiness.`,
        true,
      );
    if (account.selectable === false) {
      await task(
        `blocked:${account.id}`,
        "Resolve Meta ad account restrictions",
        account.unusableReason ??
          "Meta reports this ad account cannot run ads. Review its status in Ads Manager.",
      );
      return;
    }

    const pixels = await listZernioPixels(connectionAccountId, account.id);
    const site = await sitePixels(brand.website, brand.wanderOsWebsiteId);
    const saved = Object.entries(
      brand.performanceSettings?.metaTrackingDefaults ?? {},
    ).find(([id]) => sameAdAccountId("meta", id, account.id))?.[1];
    let pixelId =
      saved?.pixelId && pixels.some((p) => p.id === saved.pixelId)
        ? saved.pixelId
        : site.customerId && pixels.some((p) => p.id === site.customerId)
          ? site.customerId
          : pixels.length === 1
            ? pixels[0]!.id
            : null;
    if (!pixelId && pixels.length === 0) {
      pixelId = await createPixelOnce({
        brandId,
        organizationId,
        connectionAccountId,
        adAccountId: account.id,
        name: `${brand.name} · Website`.slice(0, 200),
      });
    }
    if (!pixelId) {
      await task(
        `pixel-choice:${account.id}`,
        "Select the client's Meta pixel",
        `Several pixels exist on ${account.name ?? account.id}: ${pixels.map((p) => `${p.name} (${p.id})`).join(", ")}. Choose the website's pixel in client settings. No additional pixel was created.`,
      );
      return;
    }
    await db
      .update(brandTable)
      .set({
        performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{metaTrackingDefaults}', coalesce(${brandTable.performanceSettings}->'metaTrackingDefaults', '{}'::jsonb) || ${JSON.stringify({ [account.id]: { pixelId, customEventType: saved?.customEventType ?? "PURCHASE" } })}::jsonb)`,
      })
      .where(eq(brandTable.id, brandId));
    if (!site.ids?.includes(pixelId))
      await task(
        `pixel-install:${account.id}:${pixelId}`,
        "Install and verify the Meta pixel on WanderOS",
        `Pixel ID: ${pixelId}\nAd account: ${account.name ?? account.id} (${account.id})\nWebsite: ${brand.website ?? "not recorded"}\nWanderOS website ID: ${brand.wanderOsWebsiteId ?? "not recorded"}\n\nCSM: update the site's customer Meta pixel setting to this ID and publish the site. Verify it in Events Manager, including the Purchase event. The pixel is recorded in Growth; installation has not been automated.`,
      );
    return { adAccountId: account.id, pixelId, billing };
  } catch (error) {
    await task(
      "review",
      "Finish Meta account and tracking setup",
      `Automatic setup stopped: ${error instanceof Error ? error.message : "Unknown error"}. Review the connection, saved destination, tracking defaults and workflow receipts before retrying a provider write.`,
    );
    throw error;
  }
}
