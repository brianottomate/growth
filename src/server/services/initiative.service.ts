import { initiativePreviews } from "./initiative-preview.service";
import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, withTransaction } from "@/server/db";
import {
  adTable,
  brandTable,
  campaignTable,
  contentPostTable,
  initiativeMemberTable,
  initiativeTable,
  memberTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import {
  initiativeIncludesPost,
  initiativeStatusSchema,
  initiativeTargetSchema,
} from "@/lib/initiative";

type Target = z.infer<typeof initiativeTargetSchema>;
export async function initiativeWorkspace(
  orgId: string,
  members?: {
    contentPostId: string | null;
    seriesId: string | null;
    campaignId: string | null;
  }[],
) {
  const brands = await db
    .select({ id: brandTable.id, name: brandTable.name, slug: brandTable.slug })
    .from(brandTable)
    .where(
      and(eq(brandTable.organizationId, orgId), isNull(brandTable.deletedAt)),
    );
  const ids = brands.map((b) => b.id);
  const [series, posts, campaigns, owners] = await Promise.all([
    ids.length
      ? db
          .select({
            id: seriesTable.id,
            name: seriesTable.name,
            brandId: seriesTable.brandId,
            status: seriesTable.status,
          })
          .from(seriesTable)
          .where(
            and(
              inArray(seriesTable.brandId, ids),
              isNull(seriesTable.deletedAt),
              members
                ? inArray(
                    seriesTable.id,
                    members.flatMap((m) => (m.seriesId ? [m.seriesId] : [])),
                  )
                : undefined,
            ),
          )
      : [],
    ids.length
      ? db
          .select({
            id: contentPostTable.id,
            title: contentPostTable.title,
            brandId: contentPostTable.brandId,
            seriesId: contentPostTable.seriesId,
            status: contentPostTable.status,
          })
          .from(contentPostTable)
          .where(
            and(
              inArray(contentPostTable.brandId, ids),
              isNull(contentPostTable.deletedAt),
              members
                ? (or(
                    inArray(
                      contentPostTable.id,
                      members.flatMap((m) =>
                        m.contentPostId ? [m.contentPostId] : [],
                      ),
                    ),
                    inArray(
                      contentPostTable.seriesId,
                      members.flatMap((m) => (m.seriesId ? [m.seriesId] : [])),
                    ),
                  ) ?? sql`false`)
                : undefined,
            ),
          )
          .orderBy(contentPostTable.createdAt)
      : [],
    ids.length
      ? db
          .select({
            id: campaignTable.id,
            name: campaignTable.name,
            brandId: campaignTable.brandId,
            status: campaignTable.status,
          })
          .from(campaignTable)
          .where(
            and(
              inArray(campaignTable.brandId, ids),
              isNull(campaignTable.deletedAt),
              members
                ? inArray(
                    campaignTable.id,
                    members.flatMap((m) =>
                      m.campaignId ? [m.campaignId] : [],
                    ),
                  )
                : undefined,
            ),
          )
      : [],
    db.query.memberTable.findMany({
      where: eq(memberTable.organizationId, orgId),
      with: { user: { columns: { id: true, name: true } } },
    }),
  ]);
  return {
    brands,
    series,
    posts,
    campaigns,
    owners: owners.map((m) => m.user),
  };
}
function serialize(row: typeof initiativeTable.$inferSelect) {
  return {
    ...row,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
type CardMedia = { url: string; width: number | null; height: number | null };
const mediaOf = (item: {
  url?: string;
  type?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
}): CardMedia | null => {
  const url =
    item.type === "video" ? item.thumbnail : (item.thumbnail ?? item.url);
  return url
    ? { url, width: item.width ?? null, height: item.height ?? null }
    : null;
};
/**
 * Initiatives with what a card needs: the brands taking part, how much work of
 * each kind is linked, and a few thumbnails. `brandId` keeps the ones that
 * brand leads or has linked work in.
 */
export async function listInitiatives(orgId: string, brandId?: string) {
  const rows = await db
    .select()
    .from(initiativeTable)
    .where(eq(initiativeTable.organizationId, orgId))
    .orderBy(initiativeTable.name);
  const initiativeIds = rows.map((r) => r.id);
  const members = initiativeIds.length
    ? await db
        .select()
        .from(initiativeMemberTable)
        .where(inArray(initiativeMemberTable.initiativeId, initiativeIds))
    : [];
  const ids = (key: "contentPostId" | "seriesId" | "campaignId") => [
    ...new Set(members.flatMap((m) => (m[key] ? [m[key]] : []))),
  ];
  const seriesIds = ids("seriesId");
  const campaignIds = ids("campaignId");
  const postFilter = or(
    ids("contentPostId").length
      ? inArray(contentPostTable.id, ids("contentPostId"))
      : undefined,
    seriesIds.length
      ? inArray(contentPostTable.seriesId, seriesIds)
      : undefined,
  );
  const [brands, posts, campaigns, linkedSeries] = await Promise.all([
    db
      .select({
        id: brandTable.id,
        name: brandTable.name,
        slug: brandTable.slug,
        logo: brandTable.logo,
      })
      .from(brandTable)
      .where(
        and(eq(brandTable.organizationId, orgId), isNull(brandTable.deletedAt)),
      ),
    postFilter
      ? db
          .select({
            id: contentPostTable.id,
            title: contentPostTable.title,
            brandId: contentPostTable.brandId,
            seriesId: contentPostTable.seriesId,
            media: contentPostTable.media,
          })
          .from(contentPostTable)
          .where(and(postFilter, isNull(contentPostTable.deletedAt)))
      : [],
    campaignIds.length
      ? db
          .select({ id: campaignTable.id, brandId: campaignTable.brandId })
          .from(campaignTable)
          .where(
            and(
              inArray(campaignTable.id, campaignIds),
              isNull(campaignTable.deletedAt),
            ),
          )
      : [],
    seriesIds.length
      ? db
          .select({ id: seriesTable.id, brandId: seriesTable.brandId })
          .from(seriesTable)
          .where(
            and(
              inArray(seriesTable.id, seriesIds),
              isNull(seriesTable.deletedAt),
            ),
          )
      : [],
  ]);
  const [spots, ads] = await Promise.all([
    posts.length
      ? db
          .select({
            contentPostId: platformPostTable.contentPostId,
            platform: platformPostTable.platform,
            text: platformPostTable.text,
            media: platformPostTable.media,
          })
          .from(platformPostTable)
          .where(
            inArray(
              platformPostTable.contentPostId,
              posts.map((p) => p.id),
            ),
          )
      : [],
    campaigns.length
      ? db
          .select({
            campaignId: adTable.campaignId,
            content: adTable.content,
          })
          .from(adTable)
          .where(
            inArray(
              adTable.campaignId,
              campaigns.map((c) => c.id),
            ),
          )
      : [],
  ]);
  const brandById = new Map(brands.map((b) => [b.id, b]));
  // Work of a deleted brand drops out, as it does on the initiative page.
  const active = <T extends { brandId: string }>(rows: T[]) =>
    rows.filter((row) => brandById.has(row.brandId));
  const initiatives = rows.map((row) => {
    const own = members.filter((m) => m.initiativeId === row.id);
    const ownPosts = active(posts).filter((p) =>
      initiativeIncludesPost(p, own),
    );
    const ownPostIds = new Set(ownPosts.map((p) => p.id));
    const ownSpots = spots.filter(
      (s) => s.contentPostId && ownPostIds.has(s.contentPostId),
    );
    const ownCampaigns = active(campaigns).filter((c) =>
      own.some((m) => m.campaignId === c.id),
    );
    const ownSeries = active(linkedSeries).filter((series) =>
      own.some((m) => m.seriesId === series.id),
    );
    const ownAds = ads.filter((a) =>
      ownCampaigns.some((c) => c.id === a.campaignId),
    );
    const postById = new Map(ownPosts.map((p) => [p.id, p]));
    const firstMedia = (items: Parameters<typeof mediaOf>[0][] | null) =>
      (items ?? []).map(mediaOf).find((m) => m !== null) ?? null;
    // One entry per content post, previewed by the first spot with an image.
    const socialByPost = new Map<string, typeof ownSpots>();
    for (const s of ownSpots)
      if (s.contentPostId && !["newsletter", "blog"].includes(s.platform))
        socialByPost.set(s.contentPostId, [
          ...(socialByPost.get(s.contentPostId) ?? []),
          s,
        ]);
    const socialSpots = [...socialByPost.entries()];
    const editorialSpots = ownSpots.filter((s) =>
      ["newsletter", "blog"].includes(s.platform),
    );
    const sections = {
      ads: {
        count: ownAds.length,
        items: ownAds.slice(0, 2).map((a) => ({
          media: "media" in a.content ? firstMedia(a.content.media) : null,
          text:
            "headline" in a.content
              ? a.content.headline
              : (a.content.headlines[0] ?? null),
        })),
      },
      social: {
        count: socialSpots.length,
        items: socialSpots.slice(0, 2).map(([postId, postSpots]) => {
          const post = postById.get(postId);
          return {
            media:
              postSpots.map((s) => firstMedia(s.media)).find(Boolean) ??
              firstMedia(post?.media ?? null),
            text:
              post?.title ??
              postSpots.find((s) => s.text)?.text?.slice(0, 80) ??
              null,
          };
        }),
      },
      editorial: {
        count: editorialSpots.length,
        items: editorialSpots.slice(0, 2).map((s) => ({
          kind: s.platform === "blog" ? ("blog" as const) : ("email" as const),
          // Email spots hold the subject; synced articles start with "# Title".
          title:
            (s.platform === "newsletter"
              ? s.text
              : s.text?.match(/^#\s+(.+)$/m)?.[1]) ??
            (s.contentPostId ? postById.get(s.contentPostId)?.title : null) ??
            "Untitled",
        })),
      },
    };
    const brandIds = [
      ...new Set([
        ...(row.leadBrandId ? [row.leadBrandId] : []),
        ...ownPosts.map((p) => p.brandId),
        ...ownCampaigns.map((c) => c.brandId),
        ...ownSeries.map((series) => series.brandId),
      ]),
    ];
    return {
      ...serialize(row),
      summary: {
        brands: brandIds.flatMap((id) => {
          const brand = brandById.get(id);
          return brand ? [brand] : [];
        }),
        sections,
      },
    };
  });
  return {
    initiatives: brandId
      ? initiatives.filter((i) =>
          i.summary.brands.some((brand) => brand.id === brandId),
        )
      : initiatives,
  };
}
export async function getInitiative(id: string, orgId: string) {
  const row = await db.query.initiativeTable.findFirst({
    where: and(
      eq(initiativeTable.id, id),
      eq(initiativeTable.organizationId, orgId),
    ),
  });
  if (!row) throw new Error("Initiative not found in this workspace.");
  const members = await db
    .select()
    .from(initiativeMemberTable)
    .where(eq(initiativeMemberTable.initiativeId, id));
  const workspace = await initiativeWorkspace(orgId, members);
  const previews = await initiativePreviews(
    orgId,
    workspace.posts.map((p) => p.id),
    workspace.series.map((s) => s.id),
    workspace.campaigns.map((c) => c.id),
  );
  return {
    previews,
    initiative: serialize(row),
    members: members.map(({ createdAt, ...m }) => ({
      ...m,
      createdAt: createdAt.toISOString(),
    })),
    series: workspace.series.filter((s) =>
      members.some((m) => m.seriesId === s.id),
    ),
    contentPosts: workspace.posts
      .filter((p) => initiativeIncludesPost(p, members))
      .map((p) => ({
        ...p,
        direct: members.some((m) => m.contentPostId === p.id),
      })),
    campaigns: workspace.campaigns.filter((c) =>
      members.some((m) => m.campaignId === c.id),
    ),
    brands: workspace.brands,
    owners: workspace.owners,
  };
}
export type InitiativeSave = {
  id?: string;
  name: string;
  description: string | null;
  status: z.infer<typeof initiativeStatusSchema>;
  leadBrandId: string | null;
  ownerId: string | null;
  startAt: string | null;
  endAt: string | null;
};
export async function saveInitiative(input: InitiativeSave, orgId: string) {
  const savedId = await withTransaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx
        .select({ id: initiativeTable.id })
        .from(initiativeTable)
        .where(
          and(
            eq(initiativeTable.id, input.id),
            eq(initiativeTable.organizationId, orgId),
          ),
        )
        .for("update");
      if (!existing) throw new Error("Initiative not found in this workspace.");
    }
    if (input.leadBrandId) {
      const [brand] = await tx
        .select({ id: brandTable.id })
        .from(brandTable)
        .where(
          and(
            eq(brandTable.id, input.leadBrandId),
            eq(brandTable.organizationId, orgId),
            isNull(brandTable.deletedAt),
          ),
        );
      if (!brand) throw new Error("Lead brand not found in this workspace.");
    }
    if (input.ownerId) {
      const [owner] = await tx
        .select({ id: memberTable.id })
        .from(memberTable)
        .where(
          and(
            eq(memberTable.organizationId, orgId),
            eq(memberTable.userId, input.ownerId),
          ),
        );
      if (!owner) throw new Error("Owner must belong to this workspace.");
    }
    const { id, ...fields } = input;
    const values = {
      ...fields,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      updatedAt: new Date(),
    };
    const [saved] = id
      ? await tx
          .update(initiativeTable)
          .set(values)
          .where(
            and(
              eq(initiativeTable.id, id),
              eq(initiativeTable.organizationId, orgId),
            ),
          )
          .returning()
      : await tx
          .insert(initiativeTable)
          .values({ ...values, organizationId: orgId })
          .returning();
    if (!saved) throw new Error("Initiative could not be saved.");
    return saved.id;
  });
  return getInitiative(savedId, orgId);
}
export async function changeInitiativeMember(
  id: string,
  target: Target,
  orgId: string,
  link: boolean,
) {
  initiativeTargetSchema.parse(target);
  await withTransaction(async (tx) => {
    const [initiative] = await tx
      .select({ id: initiativeTable.id })
      .from(initiativeTable)
      .where(
        and(
          eq(initiativeTable.id, id),
          eq(initiativeTable.organizationId, orgId),
        ),
      )
      .for("update");
    if (!initiative) throw new Error("Initiative not found in this workspace.");
    const table = target.contentPostId
      ? contentPostTable
      : target.seriesId
        ? seriesTable
        : campaignTable;
    const targetId =
      target.contentPostId ?? target.seriesId ?? target.campaignId;
    if (!targetId) throw new Error("Choose a membership target.");
    const [item] = await tx
      .select({ id: table.id })
      .from(table)
      .innerJoin(brandTable, eq(table.brandId, brandTable.id))
      .where(
        and(
          eq(table.id, targetId),
          isNull(table.deletedAt),
          isNull(brandTable.deletedAt),
          eq(brandTable.organizationId, orgId),
        ),
      );
    if (!item)
      throw new Error("Membership target not found in this workspace.");
    if (link)
      await tx
        .insert(initiativeMemberTable)
        .values({ initiativeId: id, ...target })
        .onConflictDoNothing();
    else
      await tx
        .delete(initiativeMemberTable)
        .where(
          and(
            eq(initiativeMemberTable.initiativeId, id),
            or(
              target.contentPostId
                ? eq(initiativeMemberTable.contentPostId, target.contentPostId)
                : undefined,
              target.seriesId
                ? eq(initiativeMemberTable.seriesId, target.seriesId)
                : undefined,
              target.campaignId
                ? eq(initiativeMemberTable.campaignId, target.campaignId)
                : undefined,
            ),
          ),
        );
  });
  return getInitiative(id, orgId);
}
