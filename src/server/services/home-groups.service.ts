import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  adTable,
  bookingTargetTable,
  brandTable,
  campaignTable,
  homeGroupMemberTable,
  homeGroupTable,
  homeTable,
} from "@/server/db/schema";
import {
  bookingTargetUrl,
  bookingTargetInputSchema,
  type BookingTargetInput,
} from "@/lib/booking-target";
import { projectIdea } from "@/lib/ad-idea-studio";
import { assertAdNotPushed } from "./ad-approval.service";

export async function groupBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}
async function ownedGroup(id: string, orgId: string) {
  const group = await db.query.homeGroupTable.findFirst({
    where: eq(homeGroupTable.id, id),
  });
  if (!group) throw new Error("Home group not found.");
  await groupBrand(group.brandId, orgId);
  return group;
}
export async function homeGroupContext(brandId: string, orgId: string) {
  const brand = await groupBrand(brandId, orgId);
  const groups = await db.query.homeGroupTable.findMany({
    where: eq(homeGroupTable.brandId, brandId),
    orderBy: [asc(homeGroupTable.createdAt)],
  });
  const homes = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    orderBy: [asc(homeTable.name)],
  });
  const memberships = groups.length
    ? await db
        .select()
        .from(homeGroupMemberTable)
        .where(
          inArray(
            homeGroupMemberTable.groupId,
            groups.map((g) => g.id),
          ),
        )
        .orderBy(
          asc(homeGroupMemberTable.sortOrder),
          asc(homeGroupMemberTable.homeId),
        )
    : [];
  return {
    wanderOsEnabled: brand.wanderOsEnabled,
    connected: Boolean(
      brand.wanderOsEnabled && brand.wanderOsWebsiteId && brand.website,
    ),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      description: g.description,
      homeIds: memberships
        .filter(
          (m) => m.groupId === g.id && homes.some((h) => h.id === m.homeId),
        )
        .map((m) => m.homeId),
    })),
    homes: homes.map((h) => ({
      id: h.id,
      name: h.name,
      source: h.source,
      url: h.url,
      externalId: h.externalId,
      heroSourceUrl: h.heroSourceUrl,
    })),
  };
}
export async function saveHomeGroup(
  input: {
    brandId: string;
    groupId?: string;
    name: string;
    description?: string | null;
  },
  orgId: string,
) {
  await groupBrand(input.brandId, orgId);
  if (input.groupId) {
    const group = await ownedGroup(input.groupId, orgId);
    if (group.brandId !== input.brandId)
      throw new Error("Group belongs to another brand.");
    await db
      .update(homeGroupTable)
      .set({
        name: input.name.trim(),
        description: input.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(homeGroupTable.id, group.id));
    return { groupId: group.id };
  }
  const [group] = await db
    .insert(homeGroupTable)
    .values({
      brandId: input.brandId,
      name: input.name.trim(),
      description: input.description ?? null,
    })
    .returning();
  return { groupId: group!.id };
}
export async function changeGroupHomes(
  input: {
    groupId: string;
    homeIds: string[];
    operation: "add" | "remove" | "replace";
  },
  orgId: string,
) {
  const group = await ownedGroup(input.groupId, orgId);
  const ids = [...new Set(input.homeIds)];
  const homes = ids.length
    ? await db
        .select({ id: homeTable.id })
        .from(homeTable)
        .where(
          and(
            eq(homeTable.brandId, group.brandId),
            isNull(homeTable.deletedAt),
            inArray(homeTable.id, ids),
          ),
        )
    : [];
  if (homes.length !== ids.length)
    throw new Error("Every home must belong to this brand and be active.");
  await withTransaction(async (tx) => {
    // Serialize edits to preserve order when two operators add members together.
    await tx
      .select()
      .from(homeGroupTable)
      .where(eq(homeGroupTable.id, group.id))
      .for("update");
    if (input.operation === "replace")
      await tx
        .delete(homeGroupMemberTable)
        .where(eq(homeGroupMemberTable.groupId, group.id));
    if (input.operation === "remove" && ids.length)
      await tx
        .delete(homeGroupMemberTable)
        .where(
          and(
            eq(homeGroupMemberTable.groupId, group.id),
            inArray(homeGroupMemberTable.homeId, ids),
          ),
        );
    if (input.operation !== "remove") {
      const members = await tx
        .select()
        .from(homeGroupMemberTable)
        .where(eq(homeGroupMemberTable.groupId, group.id));
      const offset = members.reduce(
        (max, member) => Math.max(max, member.sortOrder + 1),
        0,
      );
      if (ids.length)
        await tx
          .insert(homeGroupMemberTable)
          .values(
            ids.map((homeId, i) => ({
              groupId: group.id,
              homeId,
              sortOrder: offset + i,
            })),
          )
          .onConflictDoNothing();
    }
    await tx
      .update(homeGroupTable)
      .set({ updatedAt: new Date() })
      .where(eq(homeGroupTable.id, group.id));
  });
  return { groupId: group.id };
}
export async function deleteHomeGroup(groupId: string, orgId: string) {
  const group = await ownedGroup(groupId, orgId);
  if (group.kind === "featured")
    throw new Error("Keep the Featured group; edit its membership instead.");
  await db.delete(homeGroupTable).where(eq(homeGroupTable.id, group.id));
  return { groupId };
}
export async function setWanderOsEnabled(
  brandId: string,
  enabled: boolean,
  orgId: string,
) {
  await groupBrand(brandId, orgId);
  await db
    .update(brandTable)
    .set({
      wanderOsEnabled: enabled,
      ...(!enabled ? { wanderOsCheckedAt: new Date() } : {}),
    })
    .where(eq(brandTable.id, brandId));
  return { brandId, enabled };
}
async function bookingBrand(brandId: string, orgId: string) {
  const brand = await groupBrand(brandId, orgId);
  if (!brand.wanderOsEnabled || !brand.wanderOsWebsiteId || !brand.website)
    throw new Error(
      "Enable and connect WanderOS on this brand before using booking targets.",
    );
  return brand;
}
export async function saveBookingTarget(
  input: BookingTargetInput & { targetId?: string },
  orgId: string,
) {
  bookingTargetInputSchema.parse(input);
  await bookingBrand(input.brandId, orgId);
  if (
    input.homeGroupId &&
    (await ownedGroup(input.homeGroupId, orgId)).brandId !== input.brandId
  )
    throw new Error("Group belongs to another brand.");
  if (input.homeId) {
    const home = await db.query.homeTable.findFirst({
      where: and(
        eq(homeTable.id, input.homeId),
        eq(homeTable.brandId, input.brandId),
        isNull(homeTable.deletedAt),
      ),
    });
    if (home?.source !== "wanderos")
      throw new Error("Choose a WanderOS home from this brand.");
  }
  const values = {
    brandId: input.brandId,
    name: input.name,
    homeGroupId: input.homeGroupId ?? null,
    homeId: input.homeId ?? null,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    guests: input.guests ?? null,
    updatedAt: new Date(),
  };
  if (input.targetId) {
    const existing = await db.query.bookingTargetTable.findFirst({
      where: and(
        eq(bookingTargetTable.id, input.targetId),
        eq(bookingTargetTable.brandId, input.brandId),
      ),
    });
    if (!existing) throw new Error("Booking target not found in this brand.");
    await db
      .update(bookingTargetTable)
      .set(values)
      .where(eq(bookingTargetTable.id, existing.id));
    return { targetId: existing.id };
  }
  const [target] = await db
    .insert(bookingTargetTable)
    .values(values)
    .returning();
  return { targetId: target!.id };
}
export async function resolveBookingTarget(targetId: string, orgId: string) {
  const target = await db.query.bookingTargetTable.findFirst({
    where: eq(bookingTargetTable.id, targetId),
  });
  if (!target) throw new Error("Booking target not found.");
  const brand = await bookingBrand(target.brandId, orgId);
  if (
    target.checkIn &&
    target.checkIn <=
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
  )
    throw new Error("Choose future stay dates before using this target.");
  const context = await homeGroupContext(brand.id, orgId);
  const group = target.homeGroupId
    ? context.groups.find((g) => g.id === target.homeGroupId)
    : null;
  const selectedIds = target.homeId ? [target.homeId] : (group?.homeIds ?? []);
  if (target.homeGroupId && !selectedIds.length)
    throw new Error("This home group has no active homes.");
  const homes = selectedIds.map((id) => context.homes.find((h) => h.id === id));
  if (homes.some((h) => h?.source !== "wanderos" || !h.externalId))
    throw new Error(
      "Every selected home needs a WanderOS unit ID on this brand.",
    );
  return {
    target,
    url: bookingTargetUrl({
      website: brand.website!,
      homeUrl: target.homeId ? homes[0]!.url : undefined,
      unitIds: target.homeGroupId ? homes.map((h) => h!.externalId) : undefined,
      checkIn: target.checkIn,
      checkOut: target.checkOut,
      guests: target.guests,
    }),
  };
}
export async function listBookingTargets(brandId: string, orgId: string) {
  await groupBrand(brandId, orgId);
  const targets = await db.query.bookingTargetTable.findMany({
    where: eq(bookingTargetTable.brandId, brandId),
    orderBy: [asc(bookingTargetTable.createdAt)],
  });
  return {
    targets: await Promise.all(
      targets.map(async (t) => {
        let url: string | null = null;
        let issue: string | null = null;
        try {
          url = (await resolveBookingTarget(t.id, orgId)).url;
        } catch (error) {
          issue =
            error instanceof Error
              ? error.message
              : "Could not resolve target.";
        }
        return {
          id: t.id,
          name: t.name,
          homeGroupId: t.homeGroupId,
          homeId: t.homeId,
          checkIn: t.checkIn,
          checkOut: t.checkOut,
          guests: t.guests,
          url,
          issue,
        };
      }),
    ),
  };
}
/** Explicitly apply a URL to local draft copy. Approved/pushed ads retain their reviewed URL. */
export async function attachBookingTarget(
  input: {
    targetId: string;
    campaignId?: string;
    adId?: string;
    cardIndex?: number;
  },
  orgId: string,
) {
  const { target, url } = await resolveBookingTarget(input.targetId, orgId);
  if (input.adId) {
    const ad = await db.query.adTable.findFirst({
      where: and(
        eq(adTable.id, input.adId),
        eq(adTable.brandId, target.brandId),
      ),
    });
    if (!ad) throw new Error("Ad not found in this brand.");
    if (ad.status === "approved")
      throw new Error(
        "Reopen the approved ad before changing its booking target.",
      );
    await assertAdNotPushed(ad.id);
    const content = structuredClone(ad.content);
    if (input.cardIndex !== undefined) {
      if (!("media" in content) || !content.media[input.cardIndex])
        throw new Error("Carousel card not found.");
      content.media[input.cardIndex]!.landingUrl = url;
      content.media[input.cardIndex]!.bookingTargetId = target.id;
      if (content.ideaStudio?.document.cards[input.cardIndex])
        content.ideaStudio.document.cards[input.cardIndex]!.copy = {
          ...content.ideaStudio.document.cards[input.cardIndex]!.copy,
          landingUrl: url,
          bookingTargetId: target.id,
        };
    } else {
      content.linkUrl = url;
      if ("ideaStudio" in content && content.ideaStudio) {
        content.ideaStudio.document.copy.linkUrl = url;
        for (const copy of Object.values(
          content.ideaStudio.document.copyOverrides,
        ))
          if (copy) copy.linkUrl = url;
      }
    }
    const projected =
      "media" in content && content.ideaStudio
        ? projectIdea(ad.brandId, content, content.ideaStudio, ad.placements)
        : { content };
    const changed = await db
      .update(adTable)
      .set({
        ...projected,
        ...(input.cardIndex === undefined
          ? { bookingTargetId: target.id }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adTable.id, ad.id),
          eq(adTable.updatedAt, ad.updatedAt),
          eq(adTable.status, ad.status),
        ),
      )
      .returning({ id: adTable.id });
    if (!changed.length)
      throw new Error(
        "This ad changed while you were editing. Reload and try again.",
      );
  } else if (input.campaignId) {
    const campaign = await db.query.campaignTable.findFirst({
      where: and(
        eq(campaignTable.id, input.campaignId),
        eq(campaignTable.brandId, target.brandId),
        isNull(campaignTable.deletedAt),
      ),
    });
    if (!campaign) throw new Error("Campaign not found in this brand.");
    const approved = await db.query.adTable.findMany({
      where: and(
        eq(adTable.campaignId, campaign.id),
        eq(adTable.status, "approved"),
      ),
    });
    if (approved.some((ad) => !ad.content.linkUrl))
      throw new Error(
        "An approved ad uses this campaign's fallback URL. Reopen it or give it an explicit reviewed URL before changing the default.",
      );
    // Existing ads can already have their own URLs; don't silently replace them.
    await db
      .update(campaignTable)
      .set({
        bookingTargetId: target.id,
        landingUrl: url,
        updatedAt: new Date(),
      })
      .where(eq(campaignTable.id, campaign.id));
  } else throw new Error("Choose a campaign or an ad.");
  return { targetId: target.id, url };
}

export async function listHomesInGroup(
  brandId: string,
  groupId: string,
  orgId: string,
) {
  const group = await ownedGroup(groupId, orgId);
  if (group.brandId !== brandId)
    throw new Error("Group belongs to another brand.");
  const members = await db
    .select()
    .from(homeGroupMemberTable)
    .where(eq(homeGroupMemberTable.groupId, group.id))
    .orderBy(asc(homeGroupMemberTable.sortOrder));
  const homes = members.length
    ? await db.query.homeTable.findMany({
        where: and(
          eq(homeTable.brandId, brandId),
          isNull(homeTable.deletedAt),
          inArray(
            homeTable.id,
            members.map((m) => m.homeId),
          ),
        ),
      })
    : [];
  return members.flatMap((m) => homes.filter((h) => h.id === m.homeId));
}
