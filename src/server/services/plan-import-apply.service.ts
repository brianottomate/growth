import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  contentCommentTable,
  contentPostTable,
  platformPostTable,
  seriesTable,
  type ChannelPlatform,
  type ContentStatus,
  type TargetSpot,
} from "@/server/db/schema";
import {
  planImportItemTable,
  planImportTable,
  type PlanImportIdea,
  type PlanImportItem,
  type SlotMatch,
} from "@/server/db/plan-import-schema";
import { ContentService } from "@/server/services/content.service";

/**
 * Batch apply — materialize an import's accepted items onto the calendar.
 *
 * fill_slots: the PRIMARY matched slot's content_post is filled in place
 * (slotKind stays "cadence" so slot-generate's census still counts it as
 * occupying the month's rhythm); sibling matched slots have their spot
 * re-pointed to the primary and their emptied shell soft-deleted immediately
 * after each re-point. new_idea: ContentService.createIdea + a post-pass that
 * sets each spot's explicit format/caption/schedule.
 *
 * No transactions (neon-http; repo has none) — writes are ordered so a crashed
 * item converges on re-apply: `appliedContentPostId` is stamped LAST and
 * checked FIRST. Slot matches are re-validated at apply time (Reshuffle or a
 * competing import may have claimed a slot since matching); stale matches
 * downgrade to fresh-spot creation rather than failing the item.
 *
 * Census note: consuming a slot with a different archetype than it was minted
 * for shifts the platform|archetype census — a later generateMonthSlots re-run
 * will top the original archetype back up. Intentional (the calendar's truth
 * changed); visible via scripts/generate-month-slots.ts --dry.
 */

const noon = (dateISO: string): Date => {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y!, m! - 1, d, 12);
};

export type ApplyImportResult = {
  applied: number;
  created: number; // new_idea items among applied
  slotsConsumed: number;
  failed: { itemId: string; error: string }[];
};

async function findOrCreateSeries(
  brandId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  // Case-insensitive find-or-create (the amplifier pattern): load the brand's
  // series once into the batch cache, then insert only true misses.
  const all = await db.query.seriesTable.findMany({
    where: and(eq(seriesTable.brandId, brandId), isNull(seriesTable.deletedAt)),
    columns: { id: true, name: true },
  });
  for (const s of all) {
    const k = s.name.trim().toLowerCase();
    if (!cache.has(k)) cache.set(k, s.id);
  }
  const found = cache.get(key);
  if (found) return found;
  const [created] = await db
    .insert(seriesTable)
    .values({ brandId, name: name.trim(), status: "active" })
    .returning({ id: seriesTable.id });
  cache.set(key, created!.id);
  return created!.id;
}

/** Matched slots that are still open shells right now. */
async function revalidateMatches(matches: SlotMatch[]): Promise<SlotMatch[]> {
  if (!matches.length) return [];
  const still: SlotMatch[] = [];
  for (const m of matches) {
    const slot = await db.query.contentPostTable.findFirst({
      where: and(
        eq(contentPostTable.id, m.contentPostId),
        eq(contentPostTable.status, "slot"),
        isNull(contentPostTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (slot) still.push(m);
  }
  return still;
}

function spotFor(idea: PlanImportIdea, platform: string) {
  return idea.spots.find((s) => s.platform === platform);
}

async function applyItem(
  item: PlanImportItem,
  opts: { userId: string; seriesCache: Map<string, string> },
): Promise<{ contentPostId: string; consumed: number }> {
  const idea = item.payload;
  const contentStatus: ContentStatus =
    item.status === "accepted" ? "approved" : "draft";
  const seriesId = idea.seriesName
    ? await findOrCreateSeries(item.brandId, idea.seriesName, opts.seriesCache)
    : null;
  const plannedAt = idea.date ? noon(idea.date) : null;
  const scheduledFor = (platform: string): Date | null => {
    const s = spotFor(idea, platform);
    const d = s?.date ?? idea.date;
    return d ? noon(d) : null;
  };
  const targetSpots: TargetSpot[] = idea.spots.map((s) => ({
    platform: s.platform,
    format: s.format,
    archetype: s.archetype,
    template: s.template ?? undefined,
  }));
  const brief = {
    title: idea.title,
    pillar: idea.pillar,
    seriesId,
    ownerId: idea.ownerId ?? undefined,
    hook: idea.hook,
    captionDirection: idea.captionDirection,
    visualDirection: idea.visualDirection,
    ctaText: idea.ctaText,
    ctaKeyword: idea.ctaKeyword,
    kpi: idea.kpi,
    metadata: {
      importId: item.importId,
      importItemId: item.id,
      ownerName: idea.ownerName,
      sheetStatus: idea.sheetStatus,
      utm: idea.utm,
    },
  };

  const valid =
    item.kind === "fill_slots"
      ? await revalidateMatches(item.matchedSlots ?? [])
      : [];

  let primaryId: string;
  let consumed = 0;

  if (valid.length > 0) {
    // ---- fill the primary slot in place ----
    const primary = valid[0]!;
    primaryId = primary.contentPostId;
    consumed = valid.length;

    await db
      .update(contentPostTable)
      .set({
        ...brief,
        plannedAt,
        status: contentStatus,
        targetSpots,
        // slotKind stays "cadence" — see header comment.
      })
      .where(eq(contentPostTable.id, primaryId));

    const primarySpotDef = spotFor(idea, primary.platform);
    await db
      .update(platformPostTable)
      .set({
        format: primarySpotDef?.format,
        archetype: primarySpotDef?.archetype,
        template: primarySpotDef?.template ?? null,
        text: primarySpotDef?.caption ?? null,
        assetLinks: idea.assetLinks.length ? idea.assetLinks : null,
        scheduledAt: scheduledFor(primary.platform),
        status: contentStatus,
        ownerId: idea.ownerId ?? undefined,
      })
      .where(eq(platformPostTable.id, primary.platformPostId));

    // ---- siblings: re-point spot to the primary, soft-delete the shell ----
    for (const sibling of valid.slice(1)) {
      const def = spotFor(idea, sibling.platform);
      await db
        .update(platformPostTable)
        .set({
          contentPostId: primaryId,
          format: def?.format,
          archetype: def?.archetype,
          template: def?.template ?? null,
          text: def?.caption ?? null,
          scheduledAt: scheduledFor(sibling.platform),
          status: contentStatus,
          ownerId: idea.ownerId ?? undefined,
        })
        .where(eq(platformPostTable.id, sibling.platformPostId));
      await db
        .update(contentPostTable)
        .set({ deletedAt: new Date() })
        .where(eq(contentPostTable.id, sibling.contentPostId));
    }

    // ---- platforms with no (still-valid) slot: fresh spots on the primary ----
    const covered = new Set(valid.map((m) => m.platform));
    for (const s of idea.spots) {
      if (covered.has(s.platform)) continue;
      await db.insert(platformPostTable).values({
        brandId: item.brandId,
        contentPostId: primaryId,
        platform: s.platform as ChannelPlatform,
        format: s.format,
        archetype: s.archetype,
        template: s.template ?? null,
        text: s.caption ?? null,
        assetLinks: idea.assetLinks.length ? idea.assetLinks : null,
        source: "owned",
        status: contentStatus,
        origin: "human",
        ownerId: idea.ownerId ?? undefined,
        scheduledAt: scheduledFor(s.platform),
      });
    }
  } else {
    // ---- new idea (or every match went stale) ----
    const { id } = await ContentService.createIdea({
      brandId: item.brandId,
      title: idea.title,
      ownerId: idea.ownerId ?? opts.userId,
      createdById: opts.userId,
      pillar: idea.pillar,
      seriesId,
      plannedAt: plannedAt?.toISOString() ?? null,
      hook: idea.hook,
      captionDirection: idea.captionDirection,
      visualDirection: idea.visualDirection,
      ctaText: idea.ctaText,
      ctaKeyword: idea.ctaKeyword,
      kpi: idea.kpi,
      platforms: idea.spots.map((s) => s.platform as ChannelPlatform),
    });
    if (!id) throw new Error("createIdea returned no id");
    primaryId = id;

    // Post-pass: explicit formats/captions/schedule + import provenance.
    await db
      .update(contentPostTable)
      .set({ status: contentStatus, targetSpots, metadata: brief.metadata })
      .where(eq(contentPostTable.id, primaryId));
    const spots = await db.query.platformPostTable.findMany({
      where: eq(platformPostTable.contentPostId, primaryId),
      columns: { id: true, platform: true },
    });
    for (const spot of spots) {
      const def = spotFor(idea, spot.platform);
      if (!def) continue;
      await db
        .update(platformPostTable)
        .set({
          format: def.format,
          archetype: def.archetype,
          template: def.template ?? null,
          text: def.caption ?? null,
          assetLinks: idea.assetLinks.length ? idea.assetLinks : null,
          scheduledAt: scheduledFor(spot.platform),
          status: contentStatus,
          ownerId: idea.ownerId ?? undefined,
        })
        .where(eq(platformPostTable.id, spot.id));
    }
  }

  if (item.status === "accepted_refine") {
    await db.insert(contentCommentTable).values({
      contentPostId: primaryId,
      authorId: opts.userId,
      body: "Imported from workbook — needs refinement.",
    });
  }

  // Stamped last: the idempotency guard for re-apply.
  await db
    .update(planImportItemTable)
    .set({ appliedContentPostId: primaryId, applyError: null })
    .where(eq(planImportItemTable.id, item.id));

  return { contentPostId: primaryId, consumed };
}

export async function applyImport(opts: {
  importId: string;
  userId: string;
}): Promise<ApplyImportResult> {
  const items = await db.query.planImportItemTable.findMany({
    where: eq(planImportItemTable.importId, opts.importId),
  });
  const seriesCache = new Map<string, string>();
  const result: ApplyImportResult = {
    applied: 0,
    created: 0,
    slotsConsumed: 0,
    failed: [],
  };

  for (const item of items) {
    if (item.appliedContentPostId) continue; // converged on a prior run
    if (item.status !== "accepted" && item.status !== "accepted_refine") continue;
    try {
      const { consumed } = await applyItem(item, {
        userId: opts.userId,
        seriesCache,
      });
      result.applied++;
      result.slotsConsumed += consumed;
      if (consumed === 0) result.created++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ itemId: item.id, error });
      await db
        .update(planImportItemTable)
        .set({ applyError: error })
        .where(eq(planImportItemTable.id, item.id));
    }
  }

  // The import is "applied" once nothing reviewable remains un-applied.
  const remaining = await db.query.planImportItemTable.findMany({
    where: and(
      eq(planImportItemTable.importId, opts.importId),
      isNull(planImportItemTable.appliedContentPostId),
    ),
    columns: { id: true, status: true },
  });
  const unfinished = remaining.filter(
    (r) => r.status === "pending" || r.status === "accepted" || r.status === "accepted_refine",
  );
  if (unfinished.length === 0) {
    await db
      .update(planImportTable)
      .set({ status: "applied" })
      .where(eq(planImportTable.id, opts.importId));
  }

  return result;
}
