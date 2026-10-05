import { initiativePreviews } from "./initiative-preview.service";
import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  campaignTable,
  contentPostTable,
  initiativeMemberTable,
  initiativeTable,
  memberTable,
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
export async function listInitiatives(orgId: string) {
  const rows = await db
    .select()
    .from(initiativeTable)
    .where(eq(initiativeTable.organizationId, orgId))
    .orderBy(initiativeTable.name);
  return { initiatives: rows.map(serialize) };
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
