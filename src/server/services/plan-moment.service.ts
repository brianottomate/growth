import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplifierTable,
  brandTable,
  channelPlatformEnum,
  contentPostTable,
  campaignTable,
  channelTable,
  platformPostTable,
  seriesTable,
  type TargetSpot,
} from "@/server/db/schema";
import {
  FORMAT_ARCHETYPES,
  TEMPLATE_STARTERS,
  getPlatformFormat,
} from "@/server/content/formats";
import { scrapeBasicContent } from "@/server/clients/firecrawl.client";

/**
 * Plan a MOMENT — the forward, generative inverse of retroactive grouping.
 * Two phases, deliberately split so nothing persists until a human approves:
 *   1. generateMomentBlueprint — AI proposes a SHAPE (verdict + slots + amplifier
 *      asks). NO DB writes. Scales from a single asset push to a full launch arc,
 *      and can REJECT (verdict="campaign") when it's pure ads-ops, not content.
 *   2. commitMomentBlueprint — materializes the (edited) blueprint into a real
 *      initiative + (series for an arc) + slots + amplifier targets.
 */

const MODEL = "claude-sonnet-5";

export const momentSlotSchema = z.object({
  title: z.string(),
  dayOffset: z
    .number()
    .describe("days relative to launch day (0); negative = before"),
  slotKind: z
    .string()
    .describe(
      "'anchored' ONLY for hard date-pinned beats (teaser, announcement, recap). 'freeflow' for reactive/optional/amplification beats you'll slot opportunistically.",
    ),
  isThread: z.boolean().optional(),
  spots: z
    .array(
      z.object({
        platform: z
          .enum(channelPlatformEnum.enumValues)
          .describe("x, instagram, linkedin, blog, newsletter, …"),
        format: z
          .string()
          .describe(
            "concrete format id, e.g. x.thread, instagram.reel, newsletter.broadcast (recurring issue), or newsletter.blast (one-off email)",
          ),
        archetype: z
          .string()
          .describe(`one of: ${FORMAT_ARCHETYPES.join(", ")}`),
        template: z
          .string()
          .optional()
          .describe(TEMPLATE_STARTERS.slice(0, 5).join(", ")),
      }),
    )
    .describe("channel renderings for this slot (one piece, many channels)"),
  rationale: z.string().optional(),
});

export const amplifierAskSchema = z.object({
  name: z.string(),
  type: z.string().describe("investor | press | partner | creator | team"),
  why: z.string().optional(),
});

export const momentBlueprintSchema = z.object({
  verdict: z
    .string()
    .describe(
      "'moment' if creative is being distributed across channels; 'campaign' if it's pure ads-ops (a new audience, spend change) with no creative — then leave slots empty.",
    ),
  verdictReason: z.string().describe("one sentence explaining the verdict"),
  scale: z
    .string()
    .describe(
      "'single' = one piece across a few channels (maybe boosted), no multi-day arc; 'arc' = a multi-day, multi-piece launch (gets a series).",
    ),
  goal: z
    .string()
    .optional()
    .describe("short goal slug, e.g. fundraise | supply"),
  seriesName: z
    .string()
    .optional()
    .describe("series name (only for scale=arc)"),
  theme: z.string().optional(),
  slots: z
    .array(momentSlotSchema)
    .describe(
      "the launch arc as slots, ordered by dayOffset (empty if verdict=campaign)",
    ),
  amplifierAsks: z
    .array(amplifierAskSchema)
    .describe(
      "amplifiers to recruit (by role if no names; empty for small/campaign)",
    ),
  missing: z
    .string()
    .optional()
    .describe(
      "one or two sentences on what the plan does NOT cover — channels left unused, a cadence gap, beats you'd expect but didn't include. Honest self-critique, not a summary.",
    ),
});

export type MomentSlot = z.infer<typeof momentSlotSchema>;
export type MomentBlueprint = z.infer<typeof momentBlueprintSchema>;

const SYSTEM = `You are a head of growth scoping a coordinated content MOMENT for a brand.
Output the SHAPE only — slots (placeholders) + amplifier asks — never written copy.

First decide the VERDICT:
- "campaign": the ask is pure ads-ops (a new audience, a spend bump, targeting) with NO creative to distribute → return empty slots and say so in verdictReason.
- "moment": real creative is going out across channels → plan it.

Then the SCALE:
- "single": one piece across a few channels (e.g. a hero video → landing + IG reel + X + a boosted ad). 1-3 slots, NO series, no big arc.
- "arc": a multi-day launch (teaser → announcement → recap). A handful of slots + amplifiers.

If reference images/brief are given, treat them as the HERO creative and plan its distribution around it.

slotKind: "anchored" ONLY for hard date-pinned beats; "freeflow" for the reactive/optional/amplification beats. Don't mark everything anchored.
Keep it tight and high-signal — never 30 slots.
For email, distinguish the editorial stream from a launch send: use newsletter.broadcast only for a recurring newsletter issue; use newsletter.blast for a one-off announcement, launch, reactivation, waitlist, or experiment email. A blast is a normal calendar spot in the initiative, not part of newsletter cadence.
Always fill in "missing": an honest note on what you did NOT cover (a channel left out, a cadence gap, a beat you'd expect).`;

/** A pinned beat the operator wants reproduced verbatim during a refine. */
export type RefineInput = {
  keepSlots: MomentSlot[];
  blanks?: number; // number of NEW empty beats the operator asked you to fill
  drop?: string[]; // titles of beats the operator rejected — don't re-introduce
  steer?: string;
};

/**
 * Turn raw pasted sources — a press-release URL, a landing page, image URLs —
 * into planner input. A page URL gets scraped to markdown (the planner model
 * can't fetch URLs itself); an image URL passes straight through as hero
 * creative. The first page title seeds the moment name; its og:image becomes a
 * reference image. Run ONCE up front so refine/regenerate never re-scrape.
 */
export type IngestedSources = {
  name?: string;
  brief: string;
  imageUrls: string[];
};

const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const MAX_BRIEF_CHARS = 6_000;

export async function ingestSources(
  sources: string[],
): Promise<IngestedSources> {
  const imageUrls: string[] = [];
  const briefs: string[] = [];
  let name: string | undefined;

  for (const raw of sources) {
    const url = raw.trim();
    if (!url) continue;
    if (IMAGE_URL_RE.test(url)) {
      imageUrls.push(url);
      continue;
    }
    const page = await scrapeBasicContent({ url });
    if (!page) {
      briefs.push(`Source: ${url} (could not be fetched)`);
      continue;
    }
    const title = page.title ?? (page.metadata?.ogTitle as string | undefined);
    if (title && !name) name = title;
    const body = (page.content ?? "").slice(0, MAX_BRIEF_CHARS);
    briefs.push(
      [`Source: ${url}`, title ? `Title: ${title}` : null, body]
        .filter(Boolean)
        .join("\n"),
    );
    const og =
      (page.metadata?.ogImage as string | undefined) ??
      (page.metadata?.["og:image"] as string | undefined);
    if (og) imageUrls.push(og);
  }

  return { name, brief: briefs.join("\n\n---\n\n"), imageUrls };
}

export async function generateMomentBlueprint(opts: {
  brandName: string;
  brandTagline?: string | null;
  name?: string;
  prompt?: string;
  imageUrls?: string[];
  goal?: string;
  scaleHint?: "single" | "arc";
  refine?: RefineInput;
}): Promise<MomentBlueprint> {
  const refine = opts.refine;
  const refineSection = refine
    ? [
        `\nREFINE MODE — you are REVISING an existing plan, not starting fresh.`,
        refine.keepSlots.length
          ? `LOCKED beats — reproduce each EXACTLY (same title, dayOffset, slotKind, spots) and build the plan around them, keeping them in the final slots array:\n${JSON.stringify(refine.keepSlots, null, 2)}`
          : `No beats are locked — you may re-propose the whole arc.`,
        refine.blanks
          ? `The operator added ${refine.blanks} BLANK beat(s) — invent ${refine.blanks} new, distinct beat(s) to fill them, coherent with the locked ones.`
          : null,
        refine.drop?.length
          ? `The operator REJECTED these beats — do NOT re-introduce them or close variants:\n${refine.drop.map((t) => `- ${t}`).join("\n")}`
          : null,
        `Re-propose any non-locked beats as needed for a coherent arc. Do NOT drop or alter the locked beats.`,
        refine.steer
          ? `Operator steer (follow this closely): ${refine.steer}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  const textParts = [
    `Brand: ${opts.brandName}${opts.brandTagline ? ` — ${opts.brandTagline}` : ""}`,
    opts.name ? `Moment name: "${opts.name}"` : null,
    opts.goal ? `Goal: ${opts.goal}` : null,
    opts.prompt ? `Brief / context:\n${opts.prompt}` : null,
    opts.scaleHint === "single"
      ? `The operator wants a SINGLE focused push (1-3 slots, no multi-day arc) — respect that unless it's clearly wrong.`
      : opts.scaleHint === "arc"
        ? `The operator wants a multi-day ARC (teaser → announcement → recap) — plan it as a series.`
        : null,
    opts.imageUrls?.length
      ? `(${opts.imageUrls.length} reference image(s) attached — use as the hero creative.)`
      : null,
    `Launch day = day 0.`,
    refineSection,
  ]
    .filter(Boolean)
    .join("\n");

  const content: (
    | { type: "text"; text: string }
    | { type: "image"; image: URL }
  )[] = [{ type: "text", text: textParts }];
  for (const url of opts.imageUrls ?? []) {
    try {
      content.push({ type: "image", image: new URL(url) });
    } catch {
      // skip unparseable URLs
    }
  }

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({
      name: "MomentPlan",
      schema: momentBlueprintSchema,
    }),
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  return output;
}

export type CommitMomentResult = {
  campaignId: string;
  seriesId: string | null;
  slots: number;
  amplifierTargets: number;
};

export async function commitMomentBlueprint(opts: {
  brandId: string;
  name: string;
  launchDateISO: string;
  blueprint: MomentBlueprint;
}): Promise<CommitMomentResult> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, opts.brandId),
  });
  if (!brand) throw new Error(`Brand ${opts.brandId} not found`);

  const bp = opts.blueprint;
  const launch = new Date(opts.launchDateISO);
  const at = (offset: number) =>
    new Date(launch.getTime() + offset * 86_400_000);
  const offsets = bp.slots.map((s) => s.dayOffset);
  const startAt = at(Math.min(0, ...offsets));
  const endAt = at(Math.max(0, ...offsets));

  const [initiative] = await db
    .insert(campaignTable)
    .values({
      brandId: opts.brandId,
      name: opts.name,
      goal: bp.goal,
      status: "planned",
      startAt,
      endAt,
    })
    .returning({ id: campaignTable.id });
  const momentId = initiative!.id;

  const channels = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, opts.brandId),
  });
  const channelByPlatform = new Map(
    channels.map((channel) => [channel.platform, channel]),
  );

  // Only an arc gets a series; a single push attaches slots straight to the moment.
  let seriesId: string | null = null;
  if (bp.scale === "arc") {
    const [series] = await db
      .insert(seriesTable)
      .values({
        brandId: opts.brandId,
        name: bp.seriesName ?? opts.name,
        theme: bp.theme,
        campaignId: momentId,
        status: "planned",
        startAt,
        endAt,
      })
      .returning({ id: seriesTable.id });
    seriesId = series?.id ?? null;
  }

  for (const s of bp.slots) {
    const scheduledAt = at(s.dayOffset);
    const targetSpots: TargetSpot[] = s.spots.map((sp) => ({
      platform: sp.platform,
      format: sp.format,
      archetype: sp.archetype,
      template: sp.template,
      scheduledAt: scheduledAt.toISOString(),
    }));
    const calendarSpots = s.spots.flatMap((sp) => {
      const format = getPlatformFormat(sp.format);
      return format?.platform === sp.platform
        ? [{ ...sp, archetype: format.archetype }]
        : [];
    });
    const [contentPost] = await db
      .insert(contentPostTable)
      .values({
        brandId: opts.brandId,
        title: s.title,
        status: "slot",
        slotKind: s.slotKind,
        origin: "ai",
        campaignId: momentId,
        seriesId,
        plannedAt: scheduledAt,
        targetSpots,
        metadata: { rationale: s.rationale, isThread: s.isThread },
      })
      .returning({ id: contentPostTable.id });

    // A committed plan is already calendar intent. Materialize each target as
    // an owned slot immediately so X, LinkedIn, blog, and email blasts all show
    // on the content calendar without waiting for the later drafting step.
    if (contentPost && calendarSpots.length) {
      await db.insert(platformPostTable).values(
        calendarSpots.map((sp) => {
          const channel = channelByPlatform.get(sp.platform);
          return {
            brandId: opts.brandId,
            contentPostId: contentPost.id,
            channelId: channel?.id,
            platform: sp.platform,
            username: channel?.handle,
            format: sp.format,
            archetype: sp.archetype,
            template: sp.template,
            source: "owned" as const,
            status: "slot" as const,
            origin: "ai" as const,
            scheduledAt,
          };
        }),
      );
    }
  }

  // Amplifier asks land in the org rolodex only. Concrete amplification
  // targets are per-platform-post asks made later (by a human or the
  // assistant's requestAmplification) once the posts worth boosting exist —
  // recruitment is a judgment call per post, not a launch-wide rule.
  let amplifierTargets = 0;
  if (brand.organizationId && bp.amplifierAsks.length) {
    const orgId = brand.organizationId;
    const existing = await db.query.amplifierTable.findMany({
      where: eq(amplifierTable.organizationId, orgId),
    });
    const byName = new Map(existing.map((a) => [a.name.toLowerCase(), a]));
    for (const ask of bp.amplifierAsks) {
      let amp = byName.get(ask.name.toLowerCase());
      if (!amp) {
        const [created] = await db
          .insert(amplifierTable)
          .values({
            organizationId: orgId,
            name: ask.name,
            type: ask.type,
            notes: ask.why,
          })
          .returning();
        amp = created;
        if (amp) byName.set(amp.name.toLowerCase(), amp);
      }
      if (amp) amplifierTargets++;
    }
  }

  return {
    campaignId: momentId,
    seriesId,
    slots: bp.slots.length,
    amplifierTargets,
  };
}
