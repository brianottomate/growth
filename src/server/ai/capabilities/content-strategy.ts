import {
  saveContentSeriesNativeResultSchema,
  saveContentPillarNativeResultSchema,
  getContentStrategyNativeResultSchema,
  getContentStrategyOutputSchema,
  saveContentPillarOutputSchema,
  saveContentSeriesOutputSchema,
  organizeContentIdeasOutputSchema,
  resolveContentGroupingOutputSchema,
  deleteContentSeriesOutputSchema,
  clearContentSeriesOutputSchema,
} from "./outputs/content-strategy";

import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  contentPostTable,
  contentSuggestionTable,
  mixTargetTable,
  seriesStatusEnum,
  seriesTable,
} from "@/server/db/schema";
import {
  clearBrandSeries,
  listBrandPillars,
  purgeSeries,
  requireBrandPillar,
  saveBrandPillar,
} from "@/server/services/content-strategy.service";
import { resolveGroupingSuggestion } from "@/server/services/content-grouping.service";
import { requireOwnedBrand } from "./brand-access";
import { growthAction } from "./types";

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug");

async function requireBrandContentIdeas(
  brandId: string,
  contentPostIds: string[],
) {
  const ids = [...new Set(contentPostIds)];
  const ideas = await db.query.contentPostTable.findMany({
    where: and(
      inArray(contentPostTable.id, ids),
      eq(contentPostTable.brandId, brandId),
      isNull(contentPostTable.deletedAt),
    ),
    columns: { id: true, title: true, seriesId: true, pillar: true },
  });
  if (ideas.length !== ids.length) {
    throw new Error("One or more content ideas do not belong to this brand.");
  }
  return ideas;
}

export const getContentStrategy = growthAction({
  nativeOutputSchema: getContentStrategyNativeResultSchema,
  outputSchema: getContentStrategyOutputSchema,
  description:
    "Read one brand's content strategy vocabulary and structure: brand-specific pillars and target mix, recurring series with cadence, installments, and first-post gaps, plus pending grouping proposals awaiting review. Use this before discussing pillars, series, editorial arcs, recurring formats, or whether past posts should be grouped.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const [pillars, series, mix, groupings] = await Promise.all([
      listBrandPillars({ brandId: brand.id, brandSlug: brand.slug }),
      db.query.seriesTable.findMany({
        where: and(
          eq(seriesTable.brandId, brand.id),
          isNull(seriesTable.deletedAt),
        ),
        with: {
          contentPosts: {
            columns: {
              id: true,
              title: true,
              pillar: true,
              status: true,
              plannedAt: true,
              hook: true,
              captionDirection: true,
              visualDirection: true,
              targetSpots: true,
              media: true,
            },
            with: {
              platformPosts: {
                columns: { id: true, platform: true, archetype: true },
              },
            },
          },
        },
        orderBy: [desc(seriesTable.updatedAt)],
      }),
      db.query.mixTargetTable.findMany({
        where: and(
          eq(mixTargetTable.brandId, brand.id),
          isNull(mixTargetTable.channelId),
          eq(mixTargetTable.isActive, true),
        ),
      }),
      db.query.contentSuggestionTable.findMany({
        where: and(
          eq(contentSuggestionTable.brandId, brand.id),
          eq(contentSuggestionTable.kind, "grouping"),
          eq(contentSuggestionTable.status, "pending"),
        ),
        orderBy: [desc(contentSuggestionTable.confidence)],
      }),
    ]);
    const mixByPillar = new Map(mix.map((target) => [target.pillar, target]));
    const counts = await db
      .select({ pillar: contentPostTable.pillar })
      .from(contentPostTable)
      .where(
        and(
          eq(contentPostTable.brandId, brand.id),
          isNull(contentPostTable.deletedAt),
        ),
      );
    const countByPillar = new Map<string, number>();
    for (const row of counts) {
      if (row.pillar)
        countByPillar.set(row.pillar, (countByPillar.get(row.pillar) ?? 0) + 1);
    }
    const cadence = series.length
      ? await db.query.cadenceTargetTable.findMany({
          where: and(
            inArray(
              cadenceTargetTable.seriesId,
              series.map((item) => item.id),
            ),
            eq(cadenceTargetTable.isActive, true),
            isNull(cadenceTargetTable.deletedAt),
          ),
          columns: {
            seriesId: true,
            platform: true,
            archetype: true,
            count: true,
            period: true,
          },
        })
      : [];
    const cadenceBySeries = new Map<string, typeof cadence>();
    for (const target of cadence) {
      if (!target.seriesId) continue;
      const targets = cadenceBySeries.get(target.seriesId) ?? [];
      targets.push(target);
      cadenceBySeries.set(target.seriesId, targets);
    }
    return {
      brand: { id: brand.id, name: brand.name },
      pillars: pillars.map((pillar) => ({
        slug: pillar.slug,
        name: pillar.name,
        description: pillar.description,
        color: pillar.color,
        source: pillar.source,
        contentCount: countByPillar.get(pillar.slug) ?? 0,
        targetPct: mixByPillar.get(pillar.slug)?.targetPct ?? null,
        targetPeriod: mixByPillar.get(pillar.slug)?.period ?? null,
      })),
      series: series.map((item) => {
        const ordered = [...item.contentPosts].sort((a, b) => {
          if (!a.plannedAt && !b.plannedAt) return 0;
          if (!a.plannedAt) return 1;
          if (!b.plannedAt) return -1;
          return a.plannedAt.getTime() - b.plannedAt.getTime();
        });
        const firstTwo = ordered.slice(0, 2);
        const seriesCadence = cadenceBySeries.get(item.id) ?? [];
        const gaps = [
          !item.description && !item.theme
            ? "Define the recurring editorial promise."
            : null,
          seriesCadence.length === 0
            ? "Choose the channel, format, and publishing cadence."
            : null,
          firstTwo.length < 2
            ? `Draft ${2 - firstTwo.length} more distinct installment${2 - firstTwo.length === 1 ? "" : "s"}.`
            : null,
          firstTwo.length >= 2 &&
          firstTwo.some(
            (post) =>
              post.platformPosts.length === 0 &&
              (post.targetSpots?.length ?? 0) === 0,
          )
            ? "Assign channel renderings to both first installments."
            : null,
          firstTwo.length >= 2 && firstTwo.some((post) => !post.plannedAt)
            ? "Place both first installments on the calendar."
            : null,
          firstTwo.length >= 2 &&
          firstTwo.some(
            (post) =>
              !post.hook ||
              !(
                post.visualDirection ??
                post.captionDirection ??
                (post.media?.length ? "media" : null)
              ),
          )
            ? "Add a hook and media or copy direction to both first installments."
            : null,
        ].filter((gap): gap is string => Boolean(gap));
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          theme: item.theme,
          pillarSlug: item.pillar,
          status: item.status,
          startAt: item.startAt,
          endAt: item.endAt,
          cadence: seriesCadence,
          firstPostGaps: gaps,
          content: ordered.map((post) => ({
            id: post.id,
            title: post.title,
            pillar: post.pillar,
            status: post.status,
            plannedAt: post.plannedAt,
            hook: post.hook,
            captionDirection: post.captionDirection,
            visualDirection: post.visualDirection,
            mediaCount: post.media?.length ?? 0,
            targetSpots: post.targetSpots,
            platformPosts: post.platformPosts,
            url: `/app/content/${post.id}`,
          })),
          url: `/app/series/${item.id}`,
        };
      }),
      groupingProposals: groupings.map((proposal) => ({
        id: proposal.id,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        proposed: proposal.proposed as {
          unit?: "single" | "series";
          title?: string;
          theme?: string;
          pillarSlug?: string | null;
          memberPostIds?: string[];
          rationale?: string;
        },
      })),
      reviewUrl: "/app/content/groupings",
      pillarsUrl: "/app/pillars",
    };
  },
});

export const saveContentPillar = growthAction({
  nativeOutputSchema: saveContentPillarNativeResultSchema,
  outputSchema: saveContentPillarOutputSchema,
  description:
    "Create a new brand-specific content pillar or update an existing pillar's name, description, or color after agreeing on the change. Pillar slugs are stable because content posts and mix targets reference them.",
  inputSchema: z.object({
    brandId: z.string(),
    slug,
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(800).optional(),
    color: z.string().trim().min(1).max(80).optional(),
  }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const pillar = await saveBrandPillar({
      ...input,
      brandId: brand.id,
      brandSlug: brand.slug,
    });
    return {
      ok: true as const,
      action: "saved" as const,
      change: "pillar" as const,
      pillar,
      url: "/app/pillars",
    };
  },
});

export const saveContentSeries = growthAction({
  nativeOutputSchema: saveContentSeriesNativeResultSchema,
  outputSchema: saveContentSeriesOutputSchema,
  description:
    "Create a new recurring content series or update an existing series for one owned brand after the arc, theme, and rough timing are agreed. A series groups distinct content ideas under a shared editorial arc; it is not the same as a retrospective grouping proposal.",
  inputSchema: z.object({
    brandId: z.string(),
    seriesId: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).nullable().optional(),
    theme: z.string().trim().max(500).nullable().optional(),
    status: z.enum(seriesStatusEnum.enumValues).optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    color: z.string().trim().max(80).nullable().optional(),
    pillarSlug: slug.nullable().optional(),
    contentPostIds: z
      .array(z.string())
      .max(50)
      .optional()
      .describe(
        "Existing canonical content ideas to place into this series. Omit when only defining the series.",
      ),
  }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    if (input.pillarSlug) {
      await requireBrandPillar({
        brandId: brand.id,
        brandSlug: brand.slug,
        pillarSlug: input.pillarSlug,
      });
    }
    const ideas = input.contentPostIds?.length
      ? await requireBrandContentIdeas(brand.id, input.contentPostIds)
      : [];
    if (input.seriesId) {
      const existing = await db.query.seriesTable.findFirst({
        where: and(
          eq(seriesTable.id, input.seriesId),
          eq(seriesTable.brandId, brand.id),
          isNull(seriesTable.deletedAt),
        ),
      });
      if (!existing) throw new Error("Series not found for this brand");
      const [updated] = await db
        .update(seriesTable)
        .set({
          name: input.name,
          description: input.description,
          theme: input.theme,
          status: input.status,
          startAt:
            input.startAt === undefined
              ? undefined
              : input.startAt
                ? new Date(input.startAt)
                : null,
          endAt:
            input.endAt === undefined
              ? undefined
              : input.endAt
                ? new Date(input.endAt)
                : null,
          color: input.color,
          pillar: input.pillarSlug,
        })
        .where(eq(seriesTable.id, existing.id))
        .returning();
      const effectivePillar =
        input.pillarSlug === undefined ? existing.pillar : input.pillarSlug;
      if (input.pillarSlug !== undefined) {
        await db
          .update(contentPostTable)
          .set({ pillar: effectivePillar })
          .where(eq(contentPostTable.seriesId, existing.id));
      }
      if (ideas.length) {
        await db
          .update(contentPostTable)
          .set({ seriesId: existing.id, pillar: effectivePillar })
          .where(
            inArray(
              contentPostTable.id,
              ideas.map((idea) => idea.id),
            ),
          );
      }
      return {
        ok: true as const,
        action: "saved" as const,
        change: "updated" as const,
        series: updated,
        attachedIdeas: ideas.length,
        url: `/app/series/${existing.id}`,
        next: "Read the series again, then tell the operator what is still missing to map its first two installments. Do not stop at “series updated.”",
      };
    }
    const [created] = await db
      .insert(seriesTable)
      .values({
        brandId: brand.id,
        name: input.name,
        slug: input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        description: input.description,
        theme: input.theme,
        status: input.status ?? "planned",
        startAt: input.startAt ? new Date(input.startAt) : undefined,
        endAt: input.endAt ? new Date(input.endAt) : undefined,
        color: input.color,
        pillar: input.pillarSlug,
      })
      .returning();
    if (!created) throw new Error("Could not create the series.");
    if (ideas.length) {
      await db
        .update(contentPostTable)
        .set({ seriesId: created.id, pillar: created.pillar })
        .where(
          inArray(
            contentPostTable.id,
            ideas.map((idea) => idea.id),
          ),
        );
    }
    return {
      ok: true as const,
      action: "saved" as const,
      change: "created" as const,
      series: created,
      attachedIdeas: ideas.length,
      url: `/app/series/${created.id}`,
      next: "Read the series again, then tell the operator what is still missing to map its first two installments: editorial promise, cadence, distinct ideas, channel renderings, and dates. Do not stop at “series created.”",
    };
  },
});

export const organizeContentIdeas = growthAction({
  outputSchema: organizeContentIdeasOutputSchema,
  description:
    "Apply an agreed structural relationship to existing canonical content ideas: place them in an existing series, classify standalone ideas under a pillar, or remove them from a series. This does not merge raw channel posts; retrospective same-idea proposals use resolveContentGrouping.",
  inputSchema: z
    .object({
      brandId: z.string(),
      contentPostIds: z.array(z.string()).min(1).max(50),
      seriesId: z.string().optional(),
      pillarSlug: slug.optional(),
      removeFromSeries: z.boolean().optional(),
    })
    .refine(
      (input) =>
        !!input.seriesId || !!input.pillarSlug || !!input.removeFromSeries,
      "Choose a series, a pillar, or remove the ideas from their current series.",
    )
    .refine(
      (input) => !(input.seriesId && input.removeFromSeries),
      "Cannot assign and remove a series in the same action.",
    ),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const ideas = await requireBrandContentIdeas(
      brand.id,
      input.contentPostIds,
    );
    const series = input.seriesId
      ? await db.query.seriesTable.findFirst({
          where: and(
            eq(seriesTable.id, input.seriesId),
            eq(seriesTable.brandId, brand.id),
            isNull(seriesTable.deletedAt),
          ),
        })
      : null;
    if (input.seriesId && !series) {
      throw new Error("Series not found for this brand.");
    }
    if (input.pillarSlug) {
      await requireBrandPillar({
        brandId: brand.id,
        brandSlug: brand.slug,
        pillarSlug: input.pillarSlug,
      });
    }
    if (
      series?.pillar &&
      input.pillarSlug &&
      series.pillar !== input.pillarSlug
    ) {
      throw new Error(
        `This series belongs to ${series.pillar}. Update the series pillar instead of giving its ideas a conflicting pillar.`,
      );
    }
    if (input.pillarSlug && !series && !input.removeFromSeries) {
      const existingSeriesIds = [
        ...new Set(
          ideas.map((idea) => idea.seriesId).filter((id): id is string => !!id),
        ),
      ];
      if (existingSeriesIds.length) {
        const existingSeries = await db.query.seriesTable.findMany({
          where: inArray(seriesTable.id, existingSeriesIds),
          columns: { name: true, pillar: true },
        });
        if (
          existingSeries.some(
            (item) => item.pillar && item.pillar !== input.pillarSlug,
          )
        ) {
          throw new Error(
            "At least one idea already inherits a different pillar from its series. Move it or update the series instead.",
          );
        }
      }
    }
    const patch: { seriesId?: string | null; pillar?: string } = {};
    if (series) {
      patch.seriesId = series.id;
      if (series.pillar || input.pillarSlug) {
        patch.pillar = series.pillar ?? input.pillarSlug;
      }
    } else if (input.removeFromSeries) {
      patch.seriesId = null;
      if (input.pillarSlug) patch.pillar = input.pillarSlug;
    } else if (input.pillarSlug) {
      patch.pillar = input.pillarSlug;
    }
    await db
      .update(contentPostTable)
      .set(patch)
      .where(
        inArray(
          contentPostTable.id,
          ideas.map((idea) => idea.id),
        ),
      );
    return {
      ok: true as const,
      action: "saved" as const,
      change: "organized" as const,
      count: ideas.length,
      series: series ? { id: series.id, name: series.name } : null,
      pillarSlug: series?.pillar ?? input.pillarSlug ?? null,
      removedFromSeries: !!input.removeFromSeries,
      url: "/app/content",
    };
  },
});

export const resolveContentGrouping = growthAction({
  outputSchema: resolveContentGroupingOutputSchema,
  description:
    "Accept or reject one pending retrospective grouping proposal after discussing it. Accepting a same-idea proposal creates one canonical idea over its channel executions and amplifications. Accepting a series proposal creates one series with one idea per distinct post. Either outcome can be classified under an existing pillar.",
  inputSchema: z.object({
    brandId: z.string(),
    proposalId: z.string(),
    decision: z.enum(["accept", "reject"]),
    pillarSlug: slug.nullable().optional(),
  }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const proposal = await db.query.contentSuggestionTable.findFirst({
      where: eq(contentSuggestionTable.id, input.proposalId),
      columns: { brandId: true },
    });
    if (proposal?.brandId !== brand.id) {
      throw new Error("Grouping proposal not found for this brand.");
    }
    return resolveGroupingSuggestion({
      id: input.proposalId,
      accept: input.decision === "accept",
      orgId: ctx.orgId,
      userId: ctx.userId,
      pillarSlug: input.pillarSlug,
    });
  },
});

export const deleteContentSeries = growthAction({
  outputSchema: deleteContentSeriesOutputSchema,
  description:
    "Permanently delete one content series. This is a real delete, not an archive: the series row is gone and cannot be restored. Ideas that sat in the series survive and simply lose their series, so use this to remove editorial structure that was never right, not to remove the work underneath it.",
  inputSchema: z.object({ brandId: z.string(), seriesId: z.string() }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const existing = await db.query.seriesTable.findFirst({
      where: and(
        eq(seriesTable.id, input.seriesId),
        eq(seriesTable.brandId, brand.id),
      ),
      columns: { id: true },
    });
    if (!existing) throw new Error("Series not found for this brand.");
    const result = await purgeSeries({ seriesId: existing.id });
    return {
      ok: true as const,
      action: "deleted" as const,
      series: { id: result.id, name: result.name },
      brand: brand.name,
      detachedIdeas: result.detachedIdeas,
      url: "/app/series",
      next:
        result.detachedIdeas > 0
          ? `${result.detachedIdeas} idea(s) now have no series. Tell the operator, and offer to place them somewhere or delete them too.`
          : "Report the deletion plainly and ask what should exist in its place.",
    };
  },
});

export const clearContentSeries = growthAction({
  outputSchema: clearContentSeriesOutputSchema,
  description:
    "Permanently delete EVERY content series for one owned brand, for a clean slate. Irreversible. Ideas survive and detach. Only run this when the operator has asked to clear or reset the series shelf for that brand; to remove one series use deleteSeries.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const result = await clearBrandSeries({ brandId: brand.id });
    return {
      ok: true as const,
      action: "cleared" as const,
      brand: brand.name,
      deleted: result.deleted,
      detachedIdeas: result.detachedIdeas,
      names: result.names,
      url: "/app/series",
      next: "Name what was removed, then ask which series the brand actually wants going forward before creating anything new.",
    };
  },
});

export const CONTENT_STRATEGY_TOOLS = {
  getContentStrategy,
  saveContentPillar,
  saveContentSeries,
  deleteContentSeries,
  clearContentSeries,
  organizeContentIdeas,
  resolveContentGrouping,
} as const;
