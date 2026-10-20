import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";
import {
  adsFromCarousels,
  adsFromCarouselsSchema,
} from "@/lib/ads-from-carousels";
import { ideaPreviewUrl, projectIdea } from "@/lib/ad-idea-studio";
import { db, withTransaction } from "@/server/db";
import { adTable, brandTable, homeTable } from "@/server/db/schema";

async function ownedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

export async function approvedCarouselOptions(brandId: string, orgId: string) {
  const brand = await ownedBrand(brandId, orgId);
  const ads = await db
    .select({ ad: adTable, homeName: homeTable.name })
    .from(adTable)
    .leftJoin(
      homeTable,
      and(eq(adTable.homeId, homeTable.id), eq(homeTable.brandId, brandId)),
    )
    .where(and(eq(adTable.brandId, brandId), eq(adTable.status, "approved")))
    .orderBy(desc(adTable.approvedAt), adTable.id);
  const hero = ads.find(
    ({ ad }) =>
      "media" in ad.content &&
      ad.content.ideaStudio?.document.role === "hero_carousel",
  );
  return {
    heroCopy:
      hero && "media" in hero.ad.content
        ? hero.ad.content.ideaStudio!.document.copy
        : {
            headline: brand.name,
            body: "",
            linkUrl: brand.website ?? "",
            callToAction: "BOOK_NOW",
          },
    carousels: ads.flatMap(({ ad, homeName }) => {
      if (!ad.homeId || !homeName || !("media" in ad.content)) return [];
      const studio = ad.content.ideaStudio;
      if (
        !studio?.approval ||
        studio.document.role !== "home_carousel" ||
        !studio.document.cards.length
      )
        return [];
      const shape = studio.document.shapes[0]!;
      return [
        {
          id: ad.id,
          name: ad.name,
          homeId: ad.homeId,
          homeName,
          preview:
            studio.approval.renders[shape]?.[0]?.url ??
            ideaPreviewUrl(brandId, studio.document.cards[0]!, shape),
        },
      ];
    }),
  };
}

/** UI-only batch creation; source ads and existing statics/Hero remain intact. */
export async function createAdsFromCarousels(
  args: z.infer<typeof adsFromCarouselsSchema>,
  context: { orgId: string; userId: string },
) {
  const input = adsFromCarouselsSchema.parse(args);
  const brand = await ownedBrand(input.brandId, context.orgId);
  if (
    input.heroCopy &&
    (!input.heroCopy.headline.trim() ||
      !input.heroCopy.body.trim() ||
      !input.heroCopy.linkUrl)
  )
    throw new Error("Add the Hero headline, caption and destination.");
  const keys = input.adIds.map(
    (_, index) => `from-carousels:${brand.id}:${input.batchId}:${index}`,
  );
  if (input.heroCopy)
    keys.push(`from-carousels:${brand.id}:${input.batchId}:hero`);
  const existing = await db
    .select({ id: adTable.id })
    .from(adTable)
    .where(
      and(eq(adTable.brandId, brand.id), inArray(adTable.businessKey, keys)),
    );
  if (existing.length) return { created: existing.length };
  const loadSources = () =>
    db
      .select({ ad: adTable, homeName: homeTable.name })
      .from(adTable)
      .innerJoin(
        homeTable,
        and(eq(adTable.homeId, homeTable.id), eq(homeTable.brandId, brand.id)),
      )
      .where(
        and(
          eq(adTable.brandId, brand.id),
          eq(adTable.status, "approved"),
          inArray(adTable.id, input.adIds),
        ),
      );
  const before = await loadSources();
  if (before.length !== input.adIds.length)
    throw new Error(
      "A selected carousel is no longer available. Reopen the picker.",
    );
  const ordered = input.adIds.map((id) =>
    before.find(({ ad }) => ad.id === id)!,
  );
  const sources = ordered.map(({ ad, homeName }) => {
    if (!("media" in ad.content) || !ad.content.ideaStudio?.approval)
      throw new Error("Choose approved home carousels.");
    return { homeId: ad.homeId!, homeName, studio: ad.content.ideaStudio };
  });
  adsFromCarousels(sources, input.shapes, input.heroCopy);
  return withTransaction(async (tx) => {
    const locked = await tx
      .select()
      .from(adTable)
      .where(
        and(eq(adTable.brandId, brand.id), inArray(adTable.id, input.adIds)),
      )
      .orderBy(adTable.id)
      .for("update");
    const approved = ordered.map(({ ad, homeName }, index) => {
      const current = locked.find((row) => row.id === ad.id);
      if (
        current?.status !== "approved" ||
        !("media" in current.content) ||
        current.content.ideaStudio?.approval?.sourceVersion !==
          sources[index]!.studio.approval!.sourceVersion
      )
        throw new Error(
          "A carousel changed during creation. Reopen the picker and try again.",
        );
      return {
        homeId: ad.homeId!,
        homeName,
        studio: current.content.ideaStudio,
      };
    });
    const { statics, hero } = adsFromCarousels(
      approved,
      input.shapes,
      input.heroCopy,
    );
    const documents = [
      ...statics,
      ...(hero
        ? [{ name: "Hero carousel", homeId: null, document: hero }]
        : []),
    ];
    const saved = await tx
      .insert(adTable)
      .values(
        documents.map((item, index) => ({
          brandId: brand.id,
          campaignId: null,
          homeId: item.homeId,
          name: item.name,
          status: "ready" as const,
          readyAt: new Date(),
          readyBy: context.userId,
          businessKey: keys[index]!,
          bookingTargetId:
            item.document.copy.bookingTargetId !== undefined
              ? item.document.copy.bookingTargetId
              : item.homeId
                ? ordered[index]!.ad.bookingTargetId
                : null,
          ...projectIdea(
            brand.id,
            {
              format:
                item.document.role === "hero_static" ? "static" : "carousel",
              media: [],
              headline: "",
              body: "",
            },
            { document: item.document },
            null,
          ),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: adTable.id });
    return { created: saved.length || documents.length };
  });
}
