import "server-only";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { db, withTransaction, type TransactionClient } from "@/server/db";
import {
  brandTable,
  contentPostTable,
  platformPostTable,
  seriesTable,
  userTable,
  memberTable,
  initiativeTable,
  initiativeMemberTable,
  contentWorkbookTable as books,
  contentWorkbookResultTable as results,
} from "@/server/db/schema";
import {
  workbookDocumentSchema,
  workbookSourceSchema,
  type WorkbookDocument,
  type WorkbookRow,
} from "@/lib/content-workbook";
import { PLATFORM_FORMATS, getPlatformFormat } from "@/server/content/formats";
import { parseContentWorkbook } from "./content-workbook-parse";
import { createId } from "@/server/db/utils";
import type { z } from "zod";
type Database = typeof db | TransactionClient;
async function ownedBrand(
  database: Database,
  orgId: string,
  brandId: string,
  lock = false,
) {
  const q = database
    .select({ id: brandTable.id })
    .from(brandTable)
    .where(
      and(
        eq(brandTable.id, brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    );
  const [brand] = await (lock ? q.for("update") : q);
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}
async function bookFor(
  database: Database,
  orgId: string,
  id: string,
  lock = false,
) {
  const q = database
    .select({ book: books })
    .from(books)
    .innerJoin(brandTable, eq(brandTable.id, books.brandId))
    .where(
      and(
        eq(books.id, id),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    );
  const [row] = await (lock ? q.for("update") : q);
  if (!row) throw new Error("Workbook not found in this workspace.");
  return row.book;
}
export async function workbookOptions(
  orgId: string,
  brandId?: string,
  database: Database = db,
) {
  if (brandId) await ownedBrand(database, orgId, brandId);
  const brands = await database
    .select({ id: brandTable.id, name: brandTable.name })
    .from(brandTable)
    .where(
      and(eq(brandTable.organizationId, orgId), isNull(brandTable.deletedAt)),
    )
    .orderBy(brandTable.name);
  const series = brandId
    ? await database
        .select({
          id: seriesTable.id,
          name: seriesTable.name,
          pillar: seriesTable.pillar,
        })
        .from(seriesTable)
        .where(
          and(eq(seriesTable.brandId, brandId), isNull(seriesTable.deletedAt)),
        )
    : [];
  const owners = await database
    .select({ id: userTable.id, name: userTable.name })
    .from(memberTable)
    .innerJoin(userTable, eq(userTable.id, memberTable.userId))
    .where(eq(memberTable.organizationId, orgId));
  const initiatives = await database
    .select({ id: initiativeTable.id, name: initiativeTable.name })
    .from(initiativeTable)
    .where(eq(initiativeTable.organizationId, orgId));
  const slots = brandId
    ? await database
        .select({
          id: contentPostTable.id,
          title: contentPostTable.title,
          plannedAt: contentPostTable.plannedAt,
        })
        .from(contentPostTable)
        .where(
          and(
            eq(contentPostTable.brandId, brandId),
            eq(contentPostTable.status, "slot"),
            isNull(contentPostTable.deletedAt),
          ),
        )
        .orderBy(contentPostTable.plannedAt)
        .limit(500)
    : [];
  return {
    brands,
    series,
    owners: owners.map((o) => ({ ...o, name: o.name ?? o.id })),
    initiatives,
    slots: slots.map((s) => ({
      ...s,
      plannedAt: s.plannedAt?.toISOString() ?? null,
    })),
    formats: PLATFORM_FORMATS.map((f) => ({
      id: f.id,
      platform: f.platform,
      label: f.label,
    })),
  };
}
function grouped(document: WorkbookDocument) {
  const groups = new Map<string, WorkbookRow[]>();
  for (const row of document.rows.filter((r) => r.include)) {
    const existing = groups.get(row.ideaKey) ?? [];
    existing.push(row);
    groups.set(row.ideaKey, existing);
  }
  return groups;
}
function reviewIssues(
  document: WorkbookDocument,
  options: Awaited<ReturnType<typeof workbookOptions>>,
) {
  const issues: string[] = [];
  if (
    document.initiativeId &&
    !options.initiatives.some((i) => i.id === document.initiativeId)
  )
    issues.push("Choose an initiative from this workspace.");
  const usedSlots = new Set<string>();
  for (const group of grouped(document).values()) {
    const first = group[0]!;
    for (const row of group) {
      const prefix = `Row ${row.sourceRow}: `;
      if (!row.title.trim()) issues.push(prefix + "add a title.");
      const format = getPlatformFormat(row.format);
      if (row.platform && (!format || format.platform !== row.platform))
        issues.push(prefix + "choose a format for the selected platform.");
      if (!row.platform && (row.caption || row.format))
        issues.push(prefix + "choose a platform for this caption.");
      if (
        row.date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
          Number.isNaN(Date.parse(row.date)) ||
          new Date(row.date).toISOString().slice(0, 10) !== row.date)
      )
        issues.push(prefix + "use a valid YYYY-MM-DD date.");
      const series = options.series.find((s) => s.id === row.seriesId);
      if (row.seriesId && !series)
        issues.push(prefix + "choose a series belonging to this brand.");
      if (series?.pillar && row.pillar && series.pillar !== row.pillar)
        issues.push(prefix + "the pillar conflicts with the selected series.");
      if (row.ownerId && !options.owners.some((o) => o.id === row.ownerId))
        issues.push(prefix + "choose a current workspace member.");
      if (row.slotId && !options.slots.some((s) => s.id === row.slotId))
        issues.push(prefix + "the chosen calendar slot is unavailable.");
      const shared = [
        "title",
        "seriesId",
        "ownerId",
        "pillar",
        "slotId",
        "hook",
        "visualDirection",
        "cta",
        "keyword",
        "kpi",
      ] as const;
      if (shared.some((key) => row[key] !== first[key]))
        issues.push(
          prefix +
            "rows with the same idea key must share their title, brief, owner, series and slot.",
        );
    }
    if (first.slotId) {
      if (usedSlots.has(first.slotId))
        issues.push(`Slot ${first.slotId} is assigned to more than one idea.`);
      usedSlots.add(first.slotId);
    }
  }
  if (!document.rows.some((r) => r.include))
    issues.push("Include at least one row.");
  return [...new Set(issues)];
}
export async function listWorkbooks(orgId: string, brandId?: string) {
  if (brandId) await ownedBrand(db, orgId, brandId);
  const rows = await db
    .select({
      id: books.id,
      name: books.name,
      brandId: books.brandId,
      appliedAt: books.appliedAt,
      updatedAt: books.updatedAt,
    })
    .from(books)
    .innerJoin(brandTable, eq(brandTable.id, books.brandId))
    .where(
      and(
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
        brandId ? eq(books.brandId, brandId) : undefined,
      ),
    )
    .orderBy(desc(books.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    ...r,
    appliedAt: r.appliedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
export async function getWorkbook(orgId: string, id: string) {
  const b = await bookFor(db, orgId, id);
  const document = workbookDocumentSchema.parse(b.document);
  const receipt = await db
    .select({
      sourceRow: results.sourceRow,
      contentPostId: results.contentPostId,
      platformPostId: results.platformPostId,
    })
    .from(results)
    .where(eq(results.workbookId, id))
    .orderBy(results.sourceRow);
  return {
    id: b.id,
    brandId: b.brandId,
    name: b.name,
    document,
    warnings: b.warnings,
    issues: b.appliedAt
      ? []
      : reviewIssues(document, await workbookOptions(orgId, b.brandId)),
    appliedAt: b.appliedAt?.toISOString() ?? null,
    updatedAt: b.updatedAt.toISOString(),
    results: receipt,
  };
}
export async function importWorkbook(
  orgId: string,
  userId: string,
  brandId: string,
  source: z.infer<typeof workbookSourceSchema>,
) {
  await ownedBrand(db, orgId, brandId);
  const parsed = await parseContentWorkbook(source);
  const options = await workbookOptions(orgId, brandId);
  for (const row of parsed.document.rows) {
    for (const [key, list] of [
      ["seriesId", options.series],
      ["ownerId", options.owners],
    ] as const) {
      const value = row[key];
      if (!value) continue;
      const matches = list.filter(
        (v) => v.id === value || v.name.toLowerCase() === value.toLowerCase(),
      );
      if (matches.length === 1) row[key] = matches[0]!.id;
    }
    if (row.platform && !row.format)
      row.format =
        options.formats.find((f) => f.platform === row.platform)?.id ?? "";
  }
  const id = await withTransaction(async (tx) => {
    await ownedBrand(tx, orgId, brandId, true);
    const [b] = await tx
      .insert(books)
      .values({ brandId, name: source.name, ...parsed, createdBy: userId })
      .returning({ id: books.id });
    return b!.id;
  });
  return getWorkbook(orgId, id);
}
export async function saveWorkbook(
  orgId: string,
  id: string,
  document: WorkbookDocument,
) {
  const parsed = workbookDocumentSchema.parse(document);
  await withTransaction(async (tx) => {
    const b = await bookFor(tx, orgId, id, true);
    if (b.appliedAt)
      throw new Error("This workbook was applied. Edit its content drafts.");
    await tx
      .update(books)
      .set({ document: parsed, updatedAt: new Date() })
      .where(eq(books.id, id));
  });
  return getWorkbook(orgId, id);
}
export async function applyWorkbook(
  orgId: string,
  userId: string,
  id: string,
  reviewed: WorkbookDocument,
) {
  await withTransaction(async (tx) => {
    const b = await bookFor(tx, orgId, id, true);
    if (b.appliedAt) return;
    const document = workbookDocumentSchema.parse(b.document);
    const input = workbookDocumentSchema.parse(reviewed);
    const match = await tx.execute<{ same: boolean }>(
      sql`select ${JSON.stringify(document)}::jsonb = ${JSON.stringify(input)}::jsonb as same`,
    );
    if (!match.rows[0]?.same)
      throw new Error(
        "The saved workbook changed. Review it again before applying.",
      );
    const options = await workbookOptions(orgId, b.brandId, tx);
    const issues = reviewIssues(document, options);
    if (issues.length) throw new Error(issues.join("\n"));
    for (const group of grouped(document).values()) {
      const first = group[0]!;
      const postId = first.slotId || createId("post");
      let slotSpots: (typeof platformPostTable.$inferSelect)[] = [];
      if (first.slotId) {
        const [slot] = await tx
          .select()
          .from(contentPostTable)
          .where(
            and(
              eq(contentPostTable.id, first.slotId),
              eq(contentPostTable.brandId, b.brandId),
              eq(contentPostTable.status, "slot"),
              isNull(contentPostTable.deletedAt),
            ),
          )
          .for("update");
        if (
          !slot ||
          slot.body ||
          slot.hook ||
          slot.captionDirection ||
          slot.visualDirection ||
          slot.ctaText ||
          slot.ctaKeyword ||
          slot.kpi ||
          slot.media?.length
        )
          throw new Error(
            "The selected slot contains work or has been claimed. Choose another slot or create a new idea.",
          );
        slotSpots = await tx
          .select()
          .from(platformPostTable)
          .where(and(eq(platformPostTable.contentPostId, slot.id)))
          .for("update");
        if (
          slotSpots.some(
            (s) =>
              s.status !== "slot" ||
              s.source !== "owned" ||
              s.text ||
              s.media?.length ||
              s.deliveryExternalId ||
              s.externalId,
          )
        )
          throw new Error(
            "A selected slot has existing copy or delivery work.",
          );
        if (
          slotSpots.some(
            (s) =>
              !group.some(
                (r) => r.platform === s.platform && r.format === s.format,
              ),
          )
        )
          throw new Error(
            "Include each platform and format already present in the chosen slot.",
          );
      }
      const dates = group
        .map((r) => r.date)
        .filter(Boolean)
        .sort();
      const series = options.series.find((s) => s.id === first.seriesId);
      const values = {
        title: first.title,
        hook: first.hook,
        visualDirection: first.visualDirection,
        ctaText: first.cta,
        ctaKeyword: first.keyword,
        kpi: first.kpi,
        seriesId: first.seriesId || null,
        pillar: series?.pillar || first.pillar || null,
        ownerId: first.ownerId || userId,
        status: "draft" as const,
        origin: "human" as const,
        plannedAt: dates[0] ? new Date(`${dates[0]}T12:00:00Z`) : null,
        targetSpots: group
          .filter((r) => r.platform)
          .map((r) => ({
            platform: r.platform,
            format: r.format,
            archetype: getPlatformFormat(r.format)!.archetype,
            ...(r.date ? { scheduledAt: `${r.date}T12:00:00Z` } : {}),
          })),
      };
      if (first.slotId)
        await tx
          .update(contentPostTable)
          .set(values)
          .where(eq(contentPostTable.id, postId));
      else
        await tx.insert(contentPostTable).values({
          id: postId,
          brandId: b.brandId,
          createdById: userId,
          ...values,
        });
      for (const row of group) {
        let spotId: string | null = null;
        if (row.platform) {
          const format = getPlatformFormat(row.format)!;
          const existingIndex = slotSpots.findIndex(
            (s) => s.platform === row.platform && s.format === row.format,
          );
          const existing =
            existingIndex < 0
              ? undefined
              : slotSpots.splice(existingIndex, 1)[0];
          spotId = existing?.id ?? createId("pp");
          const spot = {
            brandId: b.brandId,
            contentPostId: postId,
            platform: format.platform,
            format: format.id,
            archetype: format.archetype,
            text: row.caption,
            source: "owned" as const,
            status: "draft" as const,
            origin: "human" as const,
            ownerId: first.ownerId || userId,
            scheduledAt: row.date ? new Date(`${row.date}T12:00:00Z`) : null,
          };
          if (existing)
            await tx
              .update(platformPostTable)
              .set(spot)
              .where(eq(platformPostTable.id, spotId));
          else
            await tx.insert(platformPostTable).values({ id: spotId, ...spot });
        }
        await tx.insert(results).values({
          workbookId: id,
          sourceRow: row.sourceRow,
          contentPostId: postId,
          platformPostId: spotId,
        });
      }
      if (slotSpots.length)
        throw new Error(
          "Include every occurrence already present in the chosen slot.",
        );
      if (document.initiativeId)
        await tx
          .insert(initiativeMemberTable)
          .values({
            initiativeId: document.initiativeId,
            contentPostId: postId,
          })
          .onConflictDoNothing();
    }
    await tx
      .update(books)
      .set({ appliedAt: new Date(), updatedAt: new Date() })
      .where(eq(books.id, id));
  });
  return getWorkbook(orgId, id);
}
