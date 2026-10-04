import { regeneratedCardsSchema } from "./schemas";
/**
 * Pair human-finished catalog headlines with ours and reverse-engineer the
 * difference into prompt rules.
 *
 *   bun --conditions=react-server scripts/copy-eval/compare.ts [label]
 *
 * Reads ~/Downloads/Copy eval/<slug>/regen-<label>.json for every brand that
 * has one, plus the Hollyhock AI → Silvina diff CSV. Writes
 * ~/Downloads/Copy eval/compare-<label>.csv and patterns-<label>.md.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

import { catalogNewCopyPrompt } from "@/server/ai/prompts";

const label = process.argv[2] ?? "baseline";
const ROOT = join(homedir(), "Downloads", "Copy eval");

type Pair = {
  brand: string;
  home: string;
  human: string;
  ours: string;
  note?: string;
};
const pairs: Pair[] = [];

function parseCsv(text: string) {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      rows.at(-1)!.push(cell);
      cell = "";
    } else if (c === "\n") {
      rows.at(-1)!.push(cell);
      cell = "";
      rows.push([]);
    } else if (c !== "\r") cell += c;
  }
  rows.at(-1)!.push(cell);
  return rows.filter((r) => r.length > 1);
}

for (const brand of ["chalets-hh", "winter-park-escapes", "hollyhock-suites"]) {
  const file = join(ROOT, brand, `regen-${label}.json`);
  if (!existsSync(file)) continue;
  for (const r of regeneratedCardsSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  ))
    pairs.push({
      brand,
      home: r.home,
      human: r.human,
      ours: r.ours,
      note: r.reason,
    });
}

// Hollyhock: our headline was on the card first, Silvina rewrote it in place.
const holly = join(
  homedir(),
  "Downloads",
  "Hollyhock catalog copy diff 2026-09-29.csv",
);
if (existsSync(holly) && !pairs.some((p) => p.brand === "hollyhock-suites")) {
  const [, ...rows] = parseCsv(await readFile(holly, "utf8"));
  for (const cells of rows) {
    const [, home, , ai, silvina, , , changed] = cells;
    if (changed === "yes")
      pairs.push({
        brand: "hollyhock-suites",
        home: home!,
        human: silvina!,
        ours: ai!,
      });
  }
}

const csv = [
  "brand,home,human,ours,same",
  ...pairs.map((p) =>
    [p.brand, p.home, p.human, p.ours, p.human === p.ours ? "yes" : "no"]
      .map((c) => `"${c.replace(/"/g, '""')}"`)
      .join(","),
  ),
].join("\n");
await writeFile(join(ROOT, `compare-${label}.csv`), csv);
console.log(`${pairs.length} pairs → compare-${label}.csv`);

const prompt = catalogNewCopyPrompt({
  brandName: "{brand}",
  story: "",
  place: "{place}",
  brandWide: ["{amenities on ≥80% of the catalog's homes}"],
  templateId: "catalog-place",
});

// Streamed: a long high-effort answer outlives a plain request's timeout.
const result = streamText({
  model: anthropic("claude-opus-5-5"),
  providerOptions: { anthropic: { effort: "high" } },
  system: `You reverse-engineer copywriting rules. You get pairs of catalog-card headlines for short-stay rental homes on Meta: the one a human shipped and the one our prompt wrote for the same home, photo and place. Chalets Hocking Hills and Winter Park Escapes cards were made by a person first and ours written afterwards on the same photo; for Hollyhock Suites ours came first and the human (Silvina, our creative lead) rewrote it. Note: the Winter Park cards may themselves come from an earlier automated tool, so weigh them below the other two as evidence of human taste.

Write a markdown report:
1. Patterns: each difference in how the humans write vs ours (lead choice, specificity, home-type nouns, repetition across a catalog, adjectives, accessibility/layout leads, length, place). For each, a count per brand and 2-4 verbatim pairs as evidence.
2. Split every pattern into FIX (ours is wrong: invented or odd facts, junk leads, wrong place) vs TASTE (a style choice) and say whether we should adopt it; call out where the humans are weaker (bland, repeated).
3. Root cause in our prompt: quote the exact sentences that produce our behaviour.
4. Proposed prompt edits as concrete replacement text, smallest change first. No word bans: guide toward the right lead instead.`,
  prompt: `Our current prompt (New copy, catalog-place template):\n\n${prompt}\n\nPairs (brand | home | human | ours | our stated reason):\n${pairs
    .map(
      (p) =>
        `${p.brand} | ${p.home} | ${p.human} | ${p.ours}${p.note ? ` | ${p.note}` : ""}`,
    )
    .join("\n")}`,
});
const text = await result.text;
await writeFile(join(ROOT, `patterns-${label}.md`), text);
console.log(`→ ${join(ROOT, `patterns-${label}.md`)}`);
process.exit(0);
