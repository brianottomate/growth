import type { TRPCRouterRecord } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import {
  acquisitionShapeEnum,
  listeningSourceTable,
  listeningTriggerEnum,
} from "@/server/db/listening-schema";
import { createId } from "@/server/db/utils";

import { protectedProcedure } from "../trpc";

// Listening STRATEGY config: the editable brand "story" (shared signal + reply
// judgment) and the per-source rows. Voice itself is read from brandFingerprint
// and shown read-only here. The single Wander brand owns listening today; we
// resolve it by slug.

const StorySchema = z.object({
  signalGuidance: z.string(),
  replyGuidance: z.string(),
  productBoilerplate: z.string().optional(),
});

const SourceConfigSchema = z.object({
  subreddits: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  watchlistGroups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        terms: z.array(z.string()),
      }),
    )
    .optional(),
  windowDays: z.number().int().optional(),
  ignoreList: z.array(z.string()).optional(),
  maxResults: z.number().int().optional(),
});

const VoiceOverrideSchema = z
  .object({
    fingerprintText: z.string(),
    overridesBrand: z.boolean().optional(),
  })
  .nullable();

// The behaviour axes, validated against the live DB enums so the client form
// and the schema can't drift.
const PlatformSchema = z.enum(channelPlatformEnum.enumValues);
const AcquisitionSchema = z.enum(acquisitionShapeEnum.enumValues);
const TriggerSchema = z.enum(listeningTriggerEnum.enumValues);

function resolveBrand() {
  return db.query.brandTable.findFirst({ where: eq(brandTable.slug, "wander") });
}

// A stable, human-ish slug for listening_source.key, made collision-safe with a
// short random suffix so repeated "Add" of the same label never trips the
// (brandId, key) unique index.
function slugifyKey(label: string, fallback: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback;
  return `${base}-${createId("").replace("_", "").slice(0, 6)}`;
}

export const listeningRouter = {
  /** Brand story + voice + all listening sources for the strategic view. */
  overview: protectedProcedure.query(async () => {
    const brand = await resolveBrand();
    if (!brand) {
      return { brand: null, story: null, brandVoice: null, sources: [] };
    }
    const sources = await db
      .select()
      .from(listeningSourceTable)
      .where(eq(listeningSourceTable.brandId, brand.id))
      .orderBy(asc(listeningSourceTable.acquisition), asc(listeningSourceTable.platform));
    return {
      brand: { id: brand.id, name: brand.name },
      story: brand.brandListeningStory ?? null,
      brandVoice: brand.brandFingerprint?.fingerprintText ?? null,
      sources,
    };
  }),

  updateStory: protectedProcedure
    .input(z.object({ brandId: z.string(), story: StorySchema }))
    .mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(brandTable)
        .set({
          brandListeningStory: {
            ...input.story,
            updatedBy: ctx.session.user.email ?? undefined,
            updatedAt: new Date().toISOString(),
          },
        })
        .where(eq(brandTable.id, input.brandId))
        .returning();
      return updated?.brandListeningStory ?? null;
    }),

  updateSource: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.object({
          label: z.string().nullable().optional(),
          isActive: z.boolean().optional(),
          shadow: z.boolean().optional(),
          signalNotes: z.string().nullable().optional(),
          trigger: z.enum(["on_demand", "scheduled", "webhook"]).optional(),
          scheduleCron: z.string().nullable().optional(),
          config: SourceConfigSchema.optional(),
          voiceOverride: VoiceOverrideSchema.optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(listeningSourceTable)
        .set(input.patch)
        .where(eq(listeningSourceTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /** Define a new place we listen. New sources start in `shadow` (read-only,
   * doesn't drive live scans) until explicitly flipped to live. */
  createSource: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        label: z.string().min(1),
        platform: PlatformSchema,
        acquisition: AcquisitionSchema,
        trigger: TriggerSchema,
        adapter: z.string().min(1),
        scheduleCron: z.string().nullable().optional(),
        signalNotes: z.string().nullable().optional(),
        config: SourceConfigSchema.optional(),
        voiceOverride: VoiceOverrideSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [created] = await db
        .insert(listeningSourceTable)
        .values({
          brandId: input.brandId,
          key: slugifyKey(input.label, input.adapter),
          label: input.label.trim(),
          platform: input.platform,
          acquisition: input.acquisition,
          trigger: input.trigger,
          adapter: input.adapter.trim(),
          scheduleCron:
            input.trigger === "scheduled"
              ? (input.scheduleCron?.trim() ?? null)
              : null,
          signalNotes: input.signalNotes?.trim() || null,
          config: input.config ?? {},
          voiceOverride: input.voiceOverride ?? null,
          // New rows are read-only until vetted — they don't drive live scans.
          shadow: true,
          isActive: true,
        })
        .returning();
      return created ?? null;
    }),

  deleteSource: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db
        .delete(listeningSourceTable)
        .where(eq(listeningSourceTable.id, input.id));
      return { id: input.id };
    }),
} satisfies TRPCRouterRecord;
