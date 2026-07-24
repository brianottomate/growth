import type { Database } from "@/server/db";
import { z } from "zod";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandInspirationTable,
  brandTable,
  channelPlatformEnum,
  channelTable,
  contentPostTable,
  initiativeTable,
  memberTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { keyDatesForYear } from "@/lib/key-dates";
import {
  completeText,
  isClaudeConfigured,
} from "@/server/clients/claude.client";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

/** Ensure the user belongs to the org that owns the given brand. Returns brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  if (!brand.organizationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot author content for a tracked/reference brand",
    });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

const platformEnum = z.enum(channelPlatformEnum.enumValues);

/** Strip ```json fences and parse, tolerating Claude's occasional wrapping. */
function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice =
    start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}

export const studioRouter = createTRPCRouter({
  /**
   * The year wheel: pillar-tagged organic series + planned main pieces, plus a
   * paid lane of initiatives. Pillars themselves come from the static registry
   * client-side; this returns only the time-positioned items.
   */
  wheel: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        year: z.number().int().min(2020).max(2100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const yearStart = new Date(input.year, 0, 1);
      const yearEnd = new Date(input.year, 11, 31, 23, 59, 59);

      // Series (organic bars) + their posts' pillars (to assign a swimlane).
      const allSeries = await ctx.db.query.seriesTable.findMany({
        where: and(
          eq(seriesTable.brandId, input.brandId),
          isNull(seriesTable.deletedAt),
        ),
        with: { contentPosts: { columns: { pillar: true } } },
      });
      const series = allSeries
        .filter((s) => {
          const start = s.startAt ?? null;
          const end = s.endAt ?? s.startAt ?? null;
          return start && end && start <= yearEnd && end >= yearStart;
        })
        .map((s) => {
          // Dominant pillar across the series' posts.
          const counts = new Map<string, number>();
          for (const p of s.contentPosts) {
            if (p.pillar) counts.set(p.pillar, (counts.get(p.pillar) ?? 0) + 1);
          }
          const pillar =
            [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          return {
            id: s.id,
            name: s.name,
            color: s.color,
            status: s.status,
            startAt: s.startAt,
            endAt: s.endAt ?? s.startAt,
            pillar,
            postCount: s.contentPosts.length,
          };
        });

      // Main pieces planned on the wheel (plannedAt within the year).
      const pieces = await ctx.db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.brandId, input.brandId),
          isNotNull(contentPostTable.plannedAt),
          gte(contentPostTable.plannedAt, yearStart),
          lte(contentPostTable.plannedAt, yearEnd),
          isNull(contentPostTable.deletedAt),
        ),
        columns: {
          id: true,
          title: true,
          pillar: true,
          plannedAt: true,
          status: true,
          seriesId: true,
          origin: true,
        },
      });

      // Paid lane: initiatives overlapping the year.
      const allInitiatives = await ctx.db.query.initiativeTable.findMany({
        where: and(
          eq(initiativeTable.brandId, input.brandId),
          isNull(initiativeTable.deletedAt),
        ),
      });
      const initiatives = allInitiatives
        .filter((i) => {
          const start = i.startAt ?? null;
          const end = i.endAt ?? i.startAt ?? null;
          return start && end && start <= yearEnd && end >= yearStart;
        })
        .map((i) => ({
          id: i.id,
          name: i.name,
          color: i.color,
          status: i.status,
          startAt: i.startAt,
          endAt: i.endAt ?? i.startAt,
          goal: i.goal,
        }));

      return { year: input.year, series, pieces, initiatives };
    }),

  /** Social channels for the brand (fan-out targets in Produce). */
  channels: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return ctx.db.query.channelTable.findMany({
        where: and(
          eq(channelTable.brandId, input.brandId),
          eq(channelTable.kind, "social"),
          isNull(channelTable.deletedAt),
        ),
        columns: {
          id: true,
          platform: true,
          handle: true,
          displayName: true,
        },
      });
    }),

  /**
   * Reference material for the Produce step: the brand's own top posts plus
   * competitor / inspiration posts (scraped) from its tracked brands.
   */
  references: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      const brand = await assertBrandAccess(ctx, input.brandId);

      const own = await ctx.db.query.platformPostTable.findMany({
        where: eq(platformPostTable.brandId, input.brandId),
        orderBy: [desc(platformPostTable.publishedAt)],
        limit: 12,
      });

      // Tracked (competitor/inspiration) brands.
      const links = await ctx.db.query.brandInspirationTable.findMany({
        where: eq(brandInspirationTable.brandId, input.brandId),
        with: { inspirationBrand: { columns: { id: true, name: true } } },
      });
      const refBrandIds = links.map((l) => l.inspirationBrandId);
      const purposeByBrand = new Map(
        links.map((l) => [l.inspirationBrandId, l.purpose]),
      );
      const nameByBrand = new Map(
        links.map((l) => [
          l.inspirationBrandId,
          l.inspirationBrand?.name ?? "Tracked",
        ]),
      );

      const refs = refBrandIds.length
        ? await ctx.db.query.platformPostTable.findMany({
            where: inArray(platformPostTable.brandId, refBrandIds),
            orderBy: [desc(platformPostTable.publishedAt)],
            limit: 24,
          })
        : [];

      const shape = (
        p: (typeof own)[number],
        kind: "own" | "competitor" | "inspiration",
        brandName: string,
      ) => ({
        id: p.id,
        platform: p.platform,
        text: p.text?.slice(0, 280) ?? null,
        thumbnail: p.media?.[0]?.thumbnail ?? p.media?.[0]?.url ?? null,
        likes: p.stats?.likes ?? null,
        externalUrl: p.externalUrl,
        kind,
        brandName,
      });

      return {
        own: own.map((p) => shape(p, "own", brand.name)),
        tracked: refs.map((p) =>
          shape(
            p,
            purposeByBrand.get(p.brandId) === "competitor"
              ? "competitor"
              : "inspiration",
            nameByBrand.get(p.brandId) ?? "Tracked",
          ),
        ),
      };
    }),

  /**
   * AI-assisted draft: given a pillar + date + optional references, returns an
   * editable main piece + series angle + per-platform hooks. Not persisted.
   */
  draftIdea: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        pillarSlug: z.string(),
        date: z.string(), // ISO date of the slot
        platforms: z.array(platformEnum).min(1),
        referenceIds: z.array(z.string()).max(12).optional(),
        steer: z.string().max(500).optional(), // optional human nudge
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await assertBrandAccess(ctx, input.brandId);
      if (!isClaudeConfigured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Claude is not configured (ANTHROPIC_API_KEY missing)",
        });
      }

      const pillar = PILLAR_BY_SLUG[input.pillarSlug];
      const when = new Date(input.date);
      const year = when.getFullYear();
      const nearby = keyDatesForYear(year)
        .map((k) => ({
          ...k,
          dist: Math.abs(k.date.getTime() - when.getTime()),
        }))
        .filter((k) => k.dist < 1000 * 60 * 60 * 24 * 21) // within 3 weeks
        .sort((a, b) => a.dist - b.dist)[0]?.keyDate;

      const fingerprint = brand.brandFingerprint;

      const refs = input.referenceIds?.length
        ? await ctx.db.query.platformPostTable.findMany({
            where: inArray(platformPostTable.id, input.referenceIds),
            columns: { platform: true, text: true },
          })
        : [];

      const system = [
        `You are a senior social content strategist for ${brand.name}${
          brand.tagline ? ` (${brand.tagline})` : ""
        }.`,
        fingerprint?.fingerprintText
          ? `Brand voice:\n${fingerprint.fingerprintText}`
          : "Write in a confident, premium, inviting travel-brand voice.",
        "Return STRICT JSON only — no prose, no code fences.",
      ].join("\n\n");

      const prompt = [
        `Content pillar: ${pillar?.name ?? input.pillarSlug} — ${pillar?.description ?? ""}`,
        `Target date: ${when.toDateString()}${
          nearby
            ? ` (near ${nearby.name} ${nearby.emoji} — ${nearby.note ?? ""})`
            : ""
        }`,
        input.steer ? `Extra direction: ${input.steer}` : "",
        refs.length
          ? `Reference posts for inspiration:\n${refs
              .map(
                (r, i) =>
                  `${i + 1}. [${r.platform}] ${r.text?.slice(0, 200) ?? ""}`,
              )
              .join("\n")}`
          : "",
        `Produce ONE main content idea and platform-specific hooks for: ${input.platforms.join(", ")}.`,
        `Respond as JSON with this exact shape:`,
        `{
  "title": "short punchy title for the main piece",
  "body": "2-4 sentence description of the main content idea / angle",
  "seriesSuggestion": "optional short series name this could belong to, or null",
  "platformHooks": { ${input.platforms.map((p) => `"${p}": "ready-to-post copy tailored to ${p} (respect its norms/length, include hashtags where natural)"`).join(", ")} }
}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const { text } = await completeText({
        system,
        prompt,
        max_tokens: 1500,
        temperature: 0.8,
      });

      try {
        const draft = parseJsonLoose<{
          title: string;
          body: string;
          seriesSuggestion: string | null;
          platformHooks: Record<string, string>;
        }>(text);
        return draft;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not parse the AI draft. Try again.",
        });
      }
    }),

  /**
   * Persist a draft: one content_post (master idea) + one platform_post per
   * chosen channel, in `draft` status, optionally under a series.
   */
  createFromDraft: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        title: z.string().min(1).max(300),
        body: z.string().max(5000).optional(),
        pillarSlug: z.string().optional(),
        plannedAt: z.string().optional(), // ISO
        origin: z.enum(["human", "ai"]).default("human"),
        seriesId: z.string().optional(),
        newSeriesName: z.string().max(200).optional(),
        posts: z
          .array(
            z.object({
              platform: platformEnum,
              channelId: z.string().optional(),
              text: z.string().max(5000).optional(),
              media: z
                .array(
                  z.object({
                    url: z.string(),
                    type: z.enum(["image", "video", "carousel"]),
                    width: z.number().optional(),
                    height: z.number().optional(),
                    thumbnail: z.string().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);

      // Optional new series.
      let seriesId = input.seriesId ?? null;
      if (!seriesId && input.newSeriesName) {
        const [s] = await ctx.db
          .insert(seriesTable)
          .values({
            id: createId("series"),
            brandId: input.brandId,
            name: input.newSeriesName,
            status: "planned",
          })
          .returning();
        seriesId = s?.id ?? null;
      }

      const [content] = await ctx.db
        .insert(contentPostTable)
        .values({
          id: createId("post"),
          brandId: input.brandId,
          seriesId,
          ownerId: ctx.session.user.id,
          createdById: ctx.session.user.id,
          title: input.title,
          body: input.body ?? null,
          pillar: input.pillarSlug ?? null,
          plannedAt: input.plannedAt ? new Date(input.plannedAt) : null,
          status: "draft",
          origin: input.origin,
        })
        .returning();
      if (!content) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create content",
        });
      }

      await ctx.db.insert(platformPostTable).values(
        input.posts.map((p) => ({
          id: createId("pp"),
          brandId: input.brandId,
          contentPostId: content.id,
          channelId: p.channelId ?? null,
          platform: p.platform,
          source: "owned" as const,
          status: "draft" as const,
          origin: input.origin,
          ownerId: ctx.session.user.id,
          text: p.text ?? null,
          media: p.media ?? null,
        })),
      );

      return { id: content.id, platformPostCount: input.posts.length };
    }),
});
