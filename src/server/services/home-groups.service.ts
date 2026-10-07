import "server-only";
import {
  type AnyColumn,
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { db, withTransaction, type TransactionClient } from "@/server/db";
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
      isPrimary: g.isPrimary,
      source: g.source,
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
  if (group.isPrimary)
    throw new Error(
      "This is the brand's primary group. Make another group primary first.",
    );
  await db.delete(homeGroupTable).where(eq(homeGroupTable.id, group.id));
  return { groupId };
}
/**
 * Make one group the brand's primary. Clears the old one first: the unique
 * index allows one primary per brand at a time.
 */
export async function makePrimaryGroup(
  tx: TransactionClient,
  brandId: string,
  groupId: string,
) {
  await tx
    .update(homeGroupTable)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(homeGroupTable.brandId, brandId),
        eq(homeGroupTable.isPrimary, true),
        ne(homeGroupTable.id, groupId),
      ),
    );
  await tx
    .update(homeGroupTable)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(
      and(eq(homeGroupTable.brandId, brandId), eq(homeGroupTable.id, groupId)),
    );
}

export async function setPrimaryHomeGroup(groupId: string, orgId: string) {
  const group = await ownedGroup(groupId, orgId);
  if (!group.isPrimary)
    await withTransaction((tx) =>
      makePrimaryGroup(tx, group.brandId, group.id),
    );
  return { groupId: group.id, brandId: group.brandId };
}

/** The brand's group from one source, created on first use. */
export async function sourceGroup(
  tx: TransactionClient,
  brandId: string,
  source: "suggested" | "intake",
) {
  const [existing] = await tx
    .select()
    .from(homeGroupTable)
    .where(
      and(
        eq(homeGroupTable.brandId, brandId),
        eq(homeGroupTable.source, source),
      ),
    )
    .orderBy(asc(homeGroupTable.createdAt))
    .limit(1)
    .for("update");
  if (existing) return existing;
  const [created] = await tx
    .insert(homeGroupTable)
    .values({
      brandId,
      source,
      name: source === "intake" ? "Client’s picks" : "Featured homes",
    })
    .returning();
  return created!;
}

/**
 * Is this home in its brand's primary group? For selects and ordering where
 * a home used to carry its own `featured` flag.
 */
export function inPrimaryGroup(homeId: AnyColumn) {
  // Raw, aliased names: inside a relational query's `where`, Drizzle renders
  // every column under the outer table's alias, which breaks the subquery.
  return sql<boolean>`exists (select 1 from home_group_member m join home_group g on g.id = m.group_id where g.is_primary and m.home_id = ${homeId})`;
}

/** The ids of a brand's primary-group homes. */
export async function primaryHomeIds(brandId: string) {
  const rows = await db
    .select({ homeId: homeGroupMemberTable.homeId })
    .from(homeGroupMemberTable)
    .innerJoin(
      homeGroupTable,
      eq(homeGroupTable.id, homeGroupMemberTable.groupId),
    )
    .where(
      and(
        eq(homeGroupTable.brandId, brandId),
        eq(homeGroupTable.isPrimary, true),
      ),
    );
  return new Set(rows.map((row) => row.homeId));
}

/**
 * Put a home in its brand's primary group or take it out: the featured tick.
 * A brand without a primary group gets a custom one first.
 */
export async function setInPrimaryGroup(
  brandId: string,
  homeId: string,
  featured: boolean,
) {
  await withTransaction(async (tx) => {
    let [primary] = await tx
      .select()
      .from(homeGroupTable)
      .where(
        and(
          eq(homeGroupTable.brandId, brandId),
          eq(homeGroupTable.isPrimary, true),
        ),
      )
      .for("update");
    if (!primary && !featured) return;
    if (!primary) {
      [primary] = await tx
        .insert(homeGroupTable)
        .values({ brandId, name: "Featured homes", isPrimary: true })
        .returning();
    }
    if (!featured) {
      await tx
        .delete(homeGroupMemberTable)
        .where(
          and(
            eq(homeGroupMemberTable.groupId, primary!.id),
            eq(homeGroupMemberTable.homeId, homeId),
          ),
        );
      return;
    }
    const [last] = await tx
      .select({ sortOrder: homeGroupMemberTable.sortOrder })
      .from(homeGroupMemberTable)
      .where(eq(homeGroupMemberTable.groupId, primary!.id))
      .orderBy(desc(homeGroupMemberTable.sortOrder))
      .limit(1);
    await tx
      .insert(homeGroupMemberTable)
      .values({
        groupId: primary!.id,
        homeId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      })
      .onConflictDoNothing();
  });
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
        "Approved ads are final. Edit it to make a draft that replaces it.",
      );
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
        "An approved ad uses this campaign's fallback URL. Return it to Studio and review an explicit URL before changing the default.",
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

/** Validate ownership before copying a reusable target into new studio ads. */
export async function studioBookingDestination(
  brandId: string,
  targetId: string,
  orgId: string,
) {
  const resolved = await resolveBookingTarget(targetId, orgId);
  if (resolved.target.brandId !== brandId)
    throw new Error("Choose this brand's booking target.");
  return { targetId: resolved.target.id, url: resolved.url };
}
