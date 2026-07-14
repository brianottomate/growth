import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  contentPostTable,
  contentSuggestionTable,
  mixTargetTable,
  seriesStatusEnum,
  seriesTable,
} from "@/server/db/schema";
import {
  listBrandPillars,
  requireBrandPillar,
  saveBrandPillar,
} from "@/server/services/content-strategy.service";
import { resolveGroupingSuggestion } from "@/server/services/content-grouping.service";
import { requireOwnedBrand } from "./brand-access";
import { defineCapability } from "./types";

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

export const getContentStrategy = defineCapability({
  name: "getContentStrategy",
  description:
    "Read one brand's content strategy vocabulary and structure: brand-specific pillars and target mix, recurring series and their content counts, plus pending grouping proposals awaiting review. Use this before discussing pillars, series, editorial arcs, recurring formats, or whether past posts should be grouped.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: true,
  domain: "content",
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
            columns: { id: true, title: true, pillar: true, status: true },
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
      series: series.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        theme: item.theme,
        pillarSlug: item.pillar,
        status: item.status,
        startAt: item.startAt,
        endAt: item.endAt,
        content: item.contentPosts,
      })),
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

export const saveContentPillar = defineCapability({
  name: "saveContentPillar",
  description:
    "Create a new brand-specific content pillar or update an existing pillar's name, description, or color after discussing the change. Pillar slugs are stable because content posts and mix targets reference them. Requires operator approval.",
  inputSchema: z.object({
    brandId: z.string(),
    slug,
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(800).optional(),
    color: z.string().trim().min(1).max(80).optional(),
  }),
  readOnly: false,
  domain: "content",
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

export const saveContentSeries = defineCapability({
  name: "saveContentSeries",
  description:
    "Create a new recurring content series or update an existing series for one owned brand after the arc, theme, and rough timing are agreed. A series groups distinct content ideas under a shared editorial arc; it is not the same as a retrospective grouping proposal. Requires operator approval.",
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
  readOnly: false,
  domain: "content",
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
        url: "/app/content",
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
      url: "/app/content",
    };
  },
});

export const organizeContentIdeas = defineCapability({
  name: "organizeContentIdeas",
  description:
    "Apply an agreed structural relationship to existing canonical content ideas: place them in an existing series, classify standalone ideas under a pillar, or remove them from a series. This does not merge raw channel posts; retrospective same-idea proposals use resolveContentGrouping. Requires operator approval.",
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
  readOnly: false,
  domain: "content",
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

export const resolveContentGrouping = defineCapability({
  name: "resolveContentGrouping",
  description:
    "Accept or reject one pending retrospective grouping proposal after discussing it. Accepting a same-idea proposal creates one canonical idea over its channel executions and amplifications. Accepting a series proposal creates one series with one idea per distinct post. Either outcome can be classified under an existing pillar. Requires operator approval.",
  inputSchema: z.object({
    brandId: z.string(),
    proposalId: z.string(),
    decision: z.enum(["accept", "reject"]),
    pillarSlug: slug.nullable().optional(),
  }),
  readOnly: false,
  domain: "content",
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

export const CONTENT_STRATEGY_CAPABILITIES = [
  getContentStrategy,
  saveContentPillar,
  saveContentSeries,
  organizeContentIdeas,
  resolveContentGrouping,
];
