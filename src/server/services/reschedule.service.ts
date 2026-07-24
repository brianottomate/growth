import "server-only";

import { and, eq } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { db } from "../db";
import { platformPostTable } from "../db/schema";
import { keyDatesForYear } from "@/lib/key-dates";

// House rule: generateText + Output.object (never generateObject). Mirrors
// content-grouping.service.ts / plan-moment.service.ts.
const MODEL = "claude-sonnet-5";

const RescheduleSchema = z.object({
  moves: z
    .array(
      z.object({
        spotId: z.string().describe("id of a spot from the provided list to move"),
        toDate: z.string().describe("new ship date as YYYY-MM-DD"),
        reason: z.string().describe("one short sentence on why this day is better"),
      }),
    )
    .describe(
      "Spots to move to a better day. Only genuine improvements — leave well-placed posts out.",
    ),
  slots: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD for a new empty placeholder slot"),
        platform: z
          .string()
          .describe("channel slug: instagram | tiktok | pinterest | youtube | facebook"),
        pillar: z
          .string()
          .describe(
            "pillar slug: timely-travel | travel-discovery | entertainment | brand-trust | insider-community",
          ),
        rationale: z.string().describe("why fill this gap (cadence gap, key date, spacing)"),
      }),
    )
    .describe("A few empty slots to inject where there are multi-day gaps in cadence."),
});

export type ReschedulePlan = z.infer<typeof RescheduleSchema>;
export type RescheduleSpot = {
  id: string;
  platform: string;
  title: string | null;
  pillar: string | null;
  date: string; // YYYY-MM-DD
};

/** The brand's dated, owned spots — the calendar the AI reasons over. */
export async function loadReschedulableSpots(brandId: string): Promise<RescheduleSpot[]> {
  const spots = await db.query.platformPostTable.findMany({
    where: and(
      eq(platformPostTable.brandId, brandId),
      eq(platformPostTable.source, "owned"),
    ),
    with: {
      contentPost: { columns: { title: true, pillar: true, plannedAt: true, deletedAt: true } },
    },
  });
  return spots
    .filter((p) => p.contentPost && !p.contentPost.deletedAt)
    .map((p): RescheduleSpot | null => {
      const at = p.scheduledAt ?? p.publishedAt ?? p.contentPost?.plannedAt ?? null;
      return at
        ? {
            id: p.id,
            platform: p.platform,
            title: p.contentPost?.title ?? null,
            pillar: p.contentPost?.pillar ?? null,
            date: at.toISOString().slice(0, 10),
          }
        : null;
    })
    .filter((x): x is RescheduleSpot => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function generateReschedule(
  brandId: string,
  year: number,
): Promise<{ plan: ReschedulePlan; spots: RescheduleSpot[] }> {
  const spots = await loadReschedulableSpots(brandId);
  const keyDates = keyDatesForYear(year)
    .map(({ keyDate, date }) => `${date.toISOString().slice(0, 10)} ${keyDate.emoji} ${keyDate.name}`)
    .join("\n");
  const spotList = spots
    .map((s) => `- [${s.id}] ${s.date} · ${s.platform} · ${s.pillar ?? "no pillar"} · ${s.title ?? "Untitled"}`)
    .join("\n");

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ name: "ReschedulePlan", schema: RescheduleSchema }),
    system: [
      "You are a social media scheduler for a luxury travel brand.",
      "Improve the posting calendar: even out spacing, avoid piling multiple posts of the same channel on one day, cluster timely/seasonal content near relevant key dates, and keep pillar variety across each week.",
      "Only propose moves that clearly improve the calendar — leave well-placed posts alone. Keep moves within roughly the same timeframe (days/weeks, not months).",
      "Suggest a small number (0–6) of empty slots where there are multi-day gaps. Every date must be YYYY-MM-DD.",
    ].join(" "),
    prompt: `Planned posts (id, current date, channel, pillar, title):\n${spotList || "(none yet)"}\n\nKey dates ${year}:\n${keyDates}\n\nPropose moves and slot fills.`,
  });

  return { plan: output, spots };
}
