import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, memberTable, adAccountTable } from "@/server/db/schema";
import {
  listZernioAccounts,
  listZernioAdAccounts,
  listZernioAdPages,
  listZernioPixels,
} from "@/server/clients/zernio.client";
import { setBrandAdAccountAllowed } from "./brand-ad-accounts.service";

async function authorizedOwner(userId: string, ownerId: string) {
  const owner = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, ownerId), isNull(brandTable.deletedAt)),
  });
  if (!owner?.organizationId) throw new Error("Brand not found");
  const member = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, userId),
      eq(memberTable.organizationId, owner.organizationId),
    ),
  });
  if (!member) throw new Error("Brand not found");
  return owner;
}

export async function sharedAdsConnections(userId: string, ownerId: string) {
  const owner = await authorizedOwner(userId, ownerId);
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, owner.organizationId!),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      metaPageId: true,
      performanceSettings: true,
    },
  });
  const connections = owner.zernioProfileId
    ? (await listZernioAccounts()).filter(
        (a) =>
          (typeof a.profileId === "string" ? a.profileId : a.profileId?._id) ===
            owner.zernioProfileId &&
          a.platform === "metaads" &&
          a.isActive !== false &&
          a.enabled !== false &&
          a.platformStatus !== "error",
      )
    : [];
  const destinations = (
    await Promise.all(
      connections.map(async (connection) => {
        const connectionId = connection._id ?? connection.id!;
        const accounts = await listZernioAdAccounts({
          accountId: connectionId,
          limit: 1000,
        });
        return Promise.all(
          accounts
            .filter((a) => a.selectable !== false)
            .map(async (a) => ({
              connectionId,
              accountId: a.id,
              name: a.name ?? a.id,
              pages: (await listZernioAdPages(connectionId, a.id)).map((p) => ({
                id: p.pageId,
                name: p.name,
              })),
            })),
        );
      }),
    )
  ).flat();
  const allowed = await db.query.adAccountTable.findMany({
    where: and(
      eq(adAccountTable.platform, "facebook"),
      eq(adAccountTable.isAllowed, true),
    ),
    columns: { brandId: true, externalId: true },
  });
  return {
    trackingDefaults: owner.performanceSettings?.metaTrackingDefaults ?? {},
    owner: { id: owner.id, name: owner.name },
    managingBrandId: owner.performanceSettings?.adsConnectionBrandId ?? null,
    managingBrandName:
      brands.find(
        (b) => b.id === owner.performanceSettings?.adsConnectionBrandId,
      )?.name ?? null,
    managingBrandSlug:
      brands.find(
        (b) => b.id === owner.performanceSettings?.adsConnectionBrandId,
      )?.slug ?? null,
    pageId: owner.metaPageId,
    destinations,
    brands: brands
      .filter((b) => b.id !== owner.id)
      .map((b) => ({
        id: b.id,
        name: b.name,
        pageId: b.metaPageId,
        managed: b.performanceSettings?.adsConnectionBrandId === owner.id,
        accountIds: allowed
          .filter((a) => a.brandId === b.id)
          .map((a) => a.externalId),
      })),
  };
}

export async function saveSharedAdsConnection(
  userId: string,
  ownerId: string,
  input: {
    brandId: string;
    connectionId: string;
    pageId: string;
    accountId: string;
  },
) {
  const state = await sharedAdsConnections(userId, ownerId);
  const client = state.brands.find((b) => b.id === input.brandId);
  const destination = state.destinations.find(
    (d) =>
      d.connectionId === input.connectionId &&
      d.accountId === input.accountId &&
      d.pages.some((p) => p.id === input.pageId),
  );
  if (!client || !destination)
    throw new Error(
      "Choose a brand in this organization and a granted Page and ad account.",
    );
  await db
    .update(brandTable)
    .set({
      metaPageId: input.pageId,
      performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{adsConnectionBrandId}', ${JSON.stringify(ownerId)}::jsonb)`,
    })
    .where(eq(brandTable.id, client.id));
  await setBrandAdAccountAllowed({
    brandId: client.id,
    platform: "facebook",
    externalId: input.accountId,
    name: destination.name,
    isAllowed: true,
    decidedBy: userId,
  });
  return { saved: true };
}

export async function readTrackingChoices(
  userId: string,
  ownerId: string,
  connectionId: string,
  accountId: string,
) {
  const state = await sharedAdsConnections(userId, ownerId);
  if (
    !state.destinations.some(
      (d) => d.connectionId === connectionId && d.accountId === accountId,
    )
  )
    throw new Error("Choose a connected ad account.");
  return listZernioPixels(connectionId, accountId);
}

export async function saveTrackingDefaults(
  userId: string,
  ownerId: string,
  input: {
    connectionId: string;
    accountId: string;
    pixelId: string;
    customEventType: string;
  },
) {
  const pixels = await readTrackingChoices(
    userId,
    ownerId,
    input.connectionId,
    input.accountId,
  );
  if (!pixels.some((p) => p.id === input.pixelId))
    throw new Error("Choose a pixel available to this ad account.");
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{metaTrackingDefaults}', coalesce(${brandTable.performanceSettings}->'metaTrackingDefaults', '{}'::jsonb) || ${JSON.stringify({ [input.accountId]: { pixelId: input.pixelId, customEventType: input.customEventType } })}::jsonb)`,
    })
    .where(eq(brandTable.id, ownerId));
  return { saved: true };
}
