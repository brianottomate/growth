import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { memberTable } from "@/server/db/auth-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import {
  acquisitionShapeEnum,
  listeningSourceTable,
  listeningTriggerEnum,
  normalizeSubreddits,
  SUBREDDIT_STANCES,
  type SubredditProfile,
} from "@/server/db/listening-schema";
import { createId } from "@/server/db/utils";
import { scanAccountWatchSources } from "@/server/services/instagram-watch.service";
import { evaluateSubreddit as evaluateSubredditProfile } from "@/server/services/subreddit-eval.service";

import {
  importBrowserEvidence,
  getBrowserEvidence,
} from "@/server/ai/capabilities/browser-evidence";
import { actionProcedure, protectedProcedure } from "@/server/api/orpc";

// Listening STRATEGY config: the editable brand "story" (shared signal + reply
// judgment) and the per-source rows. Voice itself is read from brandFingerprint
// and shown read-only here. Every owned brand can have its own listening setup.

const StorySchema = z.object({
  signalGuidance: z.string(),
  replyGuidance: z.string(),
  productBoilerplate: z.string().optional(),
});

const SubredditProfileSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  stance: z.enum(SUBREDDIT_STANCES).optional(),
  cultureSummary: z.string().optional(),
  riskFlags: z.array(z.string()).optional(),
  sanctionedPath: z.string().optional(),
  subscribers: z.number().optional(),
  evaluatedAt: z.string().optional(),
  evaluatedModel: z.string().optional(),
  voiceNotes: z.string().optional(),
  signalNotes: z.string().optional(),
});

const SourceConfigSchema = z.object({
  // Either bare names (legacy) or full profiles — read via normalizeSubreddits.
  subreddits: z.array(z.union([z.string(), SubredditProfileSchema])).optional(),
  keywords: z.array(z.string()).optional(),
  alertTerms: z
    .array(
      z.object({
        term: z.string(),
        flags: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        verifiedAt: z.string().optional(),
        status: z.enum(["live", "to_add", "to_remove"]).optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  watchlistGroups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        terms: z.array(z.string()),
      }),
    )
    .optional(),
  accounts: z
    .array(
      z.object({
        url: z.string(),
        handle: z.string().optional(),
        label: z.string().optional(),
        followers: z.number().optional(),
        verifiedAt: z.string().optional(),
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

async function ownedBrandsForUser(userId: string) {
  const memberships = await db.query.memberTable.findMany({
    where: eq(memberTable.userId, userId),
    columns: { organizationId: true },
  });
  const organizationIds = memberships.map((row) => row.organizationId);
  if (organizationIds.length === 0) return [];

  return db.query.brandTable.findMany({
    where: and(
      inArray(brandTable.organizationId, organizationIds),
      isNull(brandTable.deletedAt),
      eq(brandTable.isActive, true),
    ),
    orderBy: (brand, { asc: orderAsc }) => orderAsc(brand.createdAt),
  });
}

async function assertOwnedBrand(userId: string, brandId: string) {
  const brand = (await ownedBrandsForUser(userId)).find(
    (candidate) => candidate.id === brandId,
  );
  if (!brand) {
    throw new ORPCError("FORBIDDEN", {
      message: "You do not have access to this brand",
    });
  }
  return brand;
}

async function assertSourceManageable(userId: string, sourceId: string) {
  const source = await db.query.listeningSourceTable.findFirst({
    where: eq(listeningSourceTable.id, sourceId),
    columns: { brandId: true },
  });
  if (!source) {
    throw new ORPCError("NOT_FOUND", { message: "Listening source not found" });
  }
  await assertOwnedBrand(userId, source.brandId);
}

/**
 * Read-merge-write a single subreddit profile inside a source's jsonb config.
 * `compute` receives the existing profile (or null) and returns the next one, so
 * callers decide their own merge policy (evaluate preserves human voice notes;
 * edit overwrites with the submitted profile). Returns the merged profile, or
 * null if the source is gone. `remove` (compute → null) drops the entry.
 */
async function mutateSubreddit(
  sourceId: string,
  name: string,
  compute: (prev: SubredditProfile | null) => SubredditProfile | null,
): Promise<SubredditProfile | null> {
  const [source] = await db
    .select({ config: listeningSourceTable.config })
    .from(listeningSourceTable)
    .where(eq(listeningSourceTable.id, sourceId))
    .limit(1);
  if (!source) return null;

  const existing = normalizeSubreddits(source.config?.subreddits);
  const idx = existing.findIndex(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
  const next = compute(idx >= 0 ? existing[idx]! : null);

  let list: SubredditProfile[];
  if (next === null) {
    list = existing.filter((_, i) => i !== idx);
  } else if (idx >= 0) {
    list = existing.map((s, i) => (i === idx ? next : s));
  } else {
    list = [...existing, next];
  }

  await db
    .update(listeningSourceTable)
    .set({ config: { ...(source.config ?? {}), subreddits: list } })
    .where(eq(listeningSourceTable.id, sourceId));
  return next;
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
  importBrowserRun: actionProcedure(importBrowserEvidence),
  browserRuns: actionProcedure(getBrowserEvidence),
  /** Brand story + voice + all listening sources for the strategic view. */
  overview: protectedProcedure
    .input(z.object({ brandId: z.string().optional() }).optional())
    .handler(async ({ context: ctx, input }) => {
      const brands = await ownedBrandsForUser(ctx.session.user.id);
      if (brands.length === 0) {
        return {
          brands: [],
          brand: null,
          story: null,
          brandVoice: null,
          sources: [],
        };
      }

      const requested = input?.brandId
        ? brands.find((brand) => brand.id === input.brandId)
        : undefined;
      if (input?.brandId && !requested) {
        throw new ORPCError("FORBIDDEN", {
          message: "You do not have access to this brand",
        });
      }

      const configuredBrandIds = await db
        .selectDistinct({ brandId: listeningSourceTable.brandId })
        .from(listeningSourceTable)
        .where(
          inArray(
            listeningSourceTable.brandId,
            brands.map((brand) => brand.id),
          ),
        );
      const configured = new Set(configuredBrandIds.map((row) => row.brandId));
      const brand =
        requested ??
        brands.find(
          (candidate) =>
            configured.has(candidate.id) || candidate.brandListeningStory,
        ) ??
        brands[0]!;

      const sources = await db
        .select()
        .from(listeningSourceTable)
        .where(eq(listeningSourceTable.brandId, brand.id))
        .orderBy(
          asc(listeningSourceTable.acquisition),
          asc(listeningSourceTable.platform),
        );
      return {
        brands: brands.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          configured:
            configured.has(candidate.id) ||
            Boolean(candidate.brandListeningStory),
        })),
        brand: { id: brand.id, name: brand.name },
        story: brand.brandListeningStory ?? null,
        brandVoice: brand.brandFingerprint?.fingerprintText ?? null,
        sources,
      };
    }),

  updateStory: protectedProcedure
    .input(z.object({ brandId: z.string(), story: StorySchema }))
    .handler(async ({ input, context: ctx }) => {
      await assertOwnedBrand(ctx.session.user.id, input.brandId);
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
          signalNotes: z.string().nullable().optional(),
          trigger: z.enum(["on_demand", "scheduled", "webhook"]).optional(),
          scheduleCron: z.string().nullable().optional(),
          config: SourceConfigSchema.optional(),
          voiceOverride: VoiceOverrideSchema.optional(),
        }),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      await assertSourceManageable(ctx.session.user.id, input.id);
      const [updated] = await db
        .update(listeningSourceTable)
        .set(input.patch)
        .where(eq(listeningSourceTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /** Define a new place we listen. Its config drives scans + reply drafts immediately. */
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
    .handler(async ({ input, context: ctx }) => {
      await assertOwnedBrand(ctx.session.user.id, input.brandId);
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
          isActive: true,
        })
        .returning();
      return created ?? null;
    }),

  deleteSource: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context: ctx }) => {
      await assertSourceManageable(ctx.session.user.id, input.id);
      await db
        .delete(listeningSourceTable)
        .where(eq(listeningSourceTable.id, input.id));
      return { id: input.id };
    }),

  /**
   * Run an account-watch scan on demand (the Instagram tab's "Scan now"). Pulls
   * each watched account's recent posts, scores + drafts comments, and writes
   * the keepers as `mention` rows. Omit `sourceId` to scan all active account_watch
   * sources (what the daily cron does). Blocks on the Bright Data crawl (~60-90s).
   */
  scanAccountWatch: protectedProcedure
    .input(z.object({ sourceId: z.string().optional() }).optional())
    .handler(async ({ input, context: ctx }) => {
      if (input?.sourceId) {
        await assertSourceManageable(ctx.session.user.id, input.sourceId);
      }
      return scanAccountWatchSources({ sourceId: input?.sourceId });
    }),

  // ---- Per-subreddit profiles (config.subreddits[]) -----------------------

  /**
   * AI-evaluate a subreddit (culture, risk, sanctioned path, stance + starter
   * voice/signal notes) and store the profile on the source. Re-runnable; a
   * re-eval refreshes the AI-evaluated fields but preserves any human-edited
   * voice/signal notes and the enabled flag.
   */
  evaluateSubreddit: protectedProcedure
    .input(z.object({ sourceId: z.string(), name: z.string().min(1) }))
    .handler(async ({ input, context: ctx }) => {
      await assertSourceManageable(ctx.session.user.id, input.sourceId);
      const fresh = await evaluateSubredditProfile(input.name);
      return mutateSubreddit(input.sourceId, fresh.name, (prev) => ({
        ...fresh,
        enabled: prev?.enabled ?? fresh.enabled,
        voiceNotes: prev?.voiceNotes ?? fresh.voiceNotes,
        signalNotes: prev?.signalNotes ?? fresh.signalNotes,
      }));
    }),

  /** Upsert a subreddit profile from the editor (manual edits win). */
  setSubredditProfile: protectedProcedure
    .input(z.object({ sourceId: z.string(), profile: SubredditProfileSchema }))
    .handler(async ({ input, context: ctx }) => {
      await assertSourceManageable(ctx.session.user.id, input.sourceId);
      return mutateSubreddit(input.sourceId, input.profile.name, (prev) => ({
        ...(prev ?? {}),
        ...input.profile,
        name: prev?.name ?? input.profile.name,
      }));
    }),

  /** Drop a subreddit from a source. */
  removeSubreddit: protectedProcedure
    .input(z.object({ sourceId: z.string(), name: z.string().min(1) }))
    .handler(async ({ input, context: ctx }) => {
      await assertSourceManageable(ctx.session.user.id, input.sourceId);
      await mutateSubreddit(input.sourceId, input.name, () => null);
      return { name: input.name };
    }),
};
