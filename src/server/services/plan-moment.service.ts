import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplificationTargetTable,
  amplifierTable,
  brandTable,
  contentPostTable,
  initiativeTable,
  seriesTable,
  type TargetSpot,
} from "@/server/db/schema";
import { FORMAT_ARCHETYPES, TEMPLATE_STARTERS } from "@/server/content/formats";

/**
 * Plan a MOMENT — the forward, generative inverse of retroactive grouping.
 * Two phases, deliberately split so nothing persists until a human approves:
 *   1. generateMomentBlueprint — AI proposes a SHAPE (verdict + slots + amplifier
 *      asks). NO DB writes. Scales from a single asset push to a full launch arc,
 *      and can REJECT (verdict="campaign") when it's pure ads-ops, not content.
 *   2. commitMomentBlueprint — materializes the (edited) blueprint into a real
 *      initiative + (series for an arc) + slots + amplifier targets.
 */

const MODEL = "claude-sonnet-4-6";

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
  goal: z.string().optional().describe("short goal slug, e.g. fundraise | supply"),
  seriesName: z.string().optional().describe("series name (only for scale=arc)"),
  theme: z.string().optional(),
  slots: z
    .array(
      z.object({
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
              platform: z.string().describe("x, instagram, linkedin, blog, newsletter, …"),
              format: z.string().describe("concrete format id, e.g. x.thread, instagram.reel"),
              archetype: z.string().describe(`one of: ${FORMAT_ARCHETYPES.join(", ")}`),
              template: z.string().optional().describe(TEMPLATE_STARTERS.slice(0, 5).join(", ")),
            }),
          )
          .describe("channel renderings for this slot (one piece, many channels)"),
        rationale: z.string().optional(),
      }),
    )
    .describe("the launch arc as slots, ordered by dayOffset (empty if verdict=campaign)"),
  amplifierAsks: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().describe("investor | press | partner | creator | team"),
        why: z.string().optional(),
      }),
    )
    .describe("amplifiers to recruit (by role if no names; empty for small/campaign)"),
});

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
Keep it tight and high-signal — never 30 slots.`;

export async function generateMomentBlueprint(opts: {
  brandName: string;
  brandTagline?: string | null;
  name?: string;
  prompt?: string;
  imageUrls?: string[];
  goal?: string;
  scaleHint?: "single" | "arc";
}): Promise<MomentBlueprint> {
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
    output: Output.object({ name: "MomentPlan", schema: momentBlueprintSchema }),
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  return output;
}

export type CommitMomentResult = {
  initiativeId: string;
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
  const at = (offset: number) => new Date(launch.getTime() + offset * 86_400_000);
  const offsets = bp.slots.map((s) => s.dayOffset);
  const startAt = at(Math.min(0, ...offsets));
  const endAt = at(Math.max(0, ...offsets));

  const [initiative] = await db
    .insert(initiativeTable)
    .values({
      brandId: opts.brandId,
      name: opts.name,
      goal: bp.goal,
      status: "planned",
      startAt,
      endAt,
    })
    .returning({ id: initiativeTable.id });
  const momentId = initiative!.id;

  // Only an arc gets a series; a single push attaches slots straight to the moment.
  let seriesId: string | null = null;
  if (bp.scale === "arc") {
    const [series] = await db
      .insert(seriesTable)
      .values({
        brandId: opts.brandId,
        name: bp.seriesName ?? opts.name,
        theme: bp.theme,
        initiativeId: momentId,
        status: "planned",
        startAt,
        endAt,
      })
      .returning({ id: seriesTable.id });
    seriesId = series?.id ?? null;
  }

  for (const s of bp.slots) {
    const targetSpots: TargetSpot[] = s.spots.map((sp) => ({
      platform: sp.platform,
      format: sp.format,
      archetype: sp.archetype,
      template: sp.template,
      scheduledAt: at(s.dayOffset).toISOString(),
    }));
    await db.insert(contentPostTable).values({
      brandId: opts.brandId,
      title: s.title,
      status: "slot",
      slotKind: s.slotKind,
      origin: "ai",
      initiativeId: momentId,
      seriesId,
      plannedAt: at(s.dayOffset),
      targetSpots,
      metadata: { rationale: s.rationale, isThread: s.isThread },
    });
  }

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
          .values({ organizationId: orgId, name: ask.name, type: ask.type })
          .returning();
        amp = created;
        if (amp) byName.set(amp.name.toLowerCase(), amp);
      }
      if (amp) {
        await db.insert(amplificationTargetTable).values({
          momentId,
          amplifierId: amp.id,
          ask: "planned",
          notes: ask.why,
        });
        amplifierTargets++;
      }
    }
  }

  return {
    initiativeId: momentId,
    seriesId,
    slots: bp.slots.length,
    amplifierTargets,
  };
}
