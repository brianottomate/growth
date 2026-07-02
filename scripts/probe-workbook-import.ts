/**
 * Workbook-import probe — dry-run the paste → parse → cluster → match pipeline
 * against a fixture, with ZERO DB writes (reads only: slots, members, series).
 *
 *   bun --conditions react-server run scripts/probe-workbook-import.ts \
 *     [fixtures/workbook-august-2026.tsv] [--month 2026-08] [--brand wander]
 *
 * This is the gate before the apply/UI work: iterate the cluster prompt and
 * the deterministic mappings here until the real August paste comes through
 * clean. Acceptance check: the Aug 6 IG + Aug 7 TikTok "Day vs night" rows
 * must land as ONE idea with two spots.
 */
import { readFileSync } from "node:fs";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, seriesTable } from "@/server/db/schema";
import {
  clusterWorkbookRows,
  parseWorkbookRows,
} from "@/server/services/plan-import-parse.service";
import {
  computeGaps,
  findDuplicateHints,
  loadOpenSlots,
  matchIdeasToSlots,
} from "@/server/services/plan-import-match.service";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1]! : dflt;
};
const fixture = args.find((a) => !a.startsWith("--")) ?? "fixtures/workbook-august-2026.tsv";
const month = flag("month", "2026-08");
const brandSlug = flag("brand", "wander");

const rawText = readFileSync(fixture, "utf8");

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, brandSlug),
});
if (!brand) throw new Error(`brand "${brandSlug}" not found`);

// ---- 1. deterministic parse -------------------------------------------------
const { rows, headerMap } = parseWorkbookRows(rawText);
console.log("═══ 1. PARSE ═══");
console.log("header map:", JSON.stringify(headerMap));
for (const r of rows) {
  const caps = Object.entries(r.captions)
    .map(([k, v]) => `${k}:${v.length}ch`)
    .join(",");
  console.log(
    ` #${r.index}${r.isJunk ? " JUNK" : ""} d${r.day ?? "?"} [${r.platforms.join("+") || r.platformsRaw || "—"}] ${r.formatRaw ?? "—"} · ${(r.concept ?? "—").slice(0, 58)} · caps[${caps || "—"}] kw:${r.keyword ?? "—"} own:${r.owner ?? "—"}`,
  );
}
console.log(`rows: ${rows.length} (${rows.filter((r) => r.isJunk).length} junk-flagged)`);

// ---- 2. AI cluster ------------------------------------------------------------
const members = (
  await db.query.memberTable.findMany({
    where: brand.organizationId
      ? eq(memberTable.organizationId, brand.organizationId)
      : undefined,
    with: { user: { columns: { id: true, name: true } } },
  })
).map((m) => ({ id: m.user.id, name: m.user.name }));
const knownSeries = (
  await db.query.seriesTable.findMany({
    where: and(eq(seriesTable.brandId, brand.id), isNull(seriesTable.deletedAt)),
    columns: { name: true },
  })
).map((s) => s.name);

const t0 = Date.now();
const { ideas, droppedRowIndexes, unclusteredRowIndexes } =
  await clusterWorkbookRows({ rows, month, brandSlug, members, knownSeries });
console.log(`\n═══ 2. CLUSTER (${((Date.now() - t0) / 1000).toFixed(1)}s) ═══`);
for (const [i, idea] of ideas.entries()) {
  console.log(
    `\n[${i}] ${idea.date ?? "UNDATED"} · "${idea.title}" · pillar:${idea.pillar ?? "—"} · series:${idea.seriesName ?? "—"} · rows:[${idea.sourceRowIndexes.join(",")}]`,
  );
  console.log(
    `    kw:${idea.ctaKeyword ?? "—"} kpi:${idea.kpi ?? "—"} owner:${idea.ownerName ?? "—"}${idea.ownerName && !idea.ownerId ? " ⚠ UNRESOLVED" : idea.ownerId ? " ✓" : ""} assets:${idea.assetLinks.length}`,
  );
  for (const s of idea.spots)
    console.log(
      `    ${s.platform} · ${s.format}${s.template ? `/${s.template}` : ""}${s.date ? ` · own day ${s.date}` : ""} · caption:${s.caption ? `${s.caption.length}ch` : "NONE"}`,
    );
}
console.log(
  `\nideas: ${ideas.length} · dropped rows: [${droppedRowIndexes.join(",")}] · unclustered fallbacks: [${unclusteredRowIndexes.join(",")}]`,
);

// invariants
const claimedCounts = new Map<number, number>();
for (const idea of ideas)
  for (const ri of idea.sourceRowIndexes)
    claimedCounts.set(ri, (claimedCounts.get(ri) ?? 0) + 1);
const doubleClaimed = [...claimedCounts.entries()].filter(([, n]) => n > 1);
const lost = rows.filter(
  (r) => !r.isJunk && !claimedCounts.has(r.index) && !droppedRowIndexes.includes(r.index),
);
const captionlessWithSource = ideas.flatMap((idea) =>
  idea.spots
    .filter((s) => !s.caption && ["instagram", "tiktok", "youtube"].includes(s.platform))
    .map((s) => `${idea.title.slice(0, 30)}/${s.platform}`),
);
console.log(
  `invariants: double-claimed rows: ${doubleClaimed.length ? JSON.stringify(doubleClaimed) : "none ✓"} · lost non-junk rows: ${lost.length ? lost.map((r) => r.index).join(",") : "none ✓"} · captionless social spots: ${captionlessWithSource.length ? captionlessWithSource.join(", ") : "none ✓"}`,
);

// ---- 3. match -----------------------------------------------------------------
const slots = await loadOpenSlots(brand.id, month);
const results = matchIdeasToSlots(ideas, slots);
const dupes = await findDuplicateHints(ideas, brand.id, month);
console.log(`\n═══ 3. MATCH (${slots.length} open slots) ═══`);
for (const [i, res] of results.entries()) {
  const idea = ideas[i]!;
  console.log(
    `[${i}] ${res.kind} conf:${res.confidence}${dupes.has(i) ? " ⚠ possible-duplicate" : ""} · "${idea.title.slice(0, 50)}"`,
  );
  console.log(`    ${res.reasoning}`);
}

// ---- 4. gaps -------------------------------------------------------------------
const consumed = new Set(
  results.flatMap((r) => r.matches.map((m) => m.contentPostId)),
);
const gaps = computeGaps(slots, consumed);
const byPlatform = new Map<string, string[]>();
for (const g of gaps)
  (byPlatform.get(g.platform) ?? byPlatform.set(g.platform, []).get(g.platform)!).push(
    g.date.slice(8),
  );
console.log(`\n═══ 4. GAPS ═══`);
for (const [pf, days] of [...byPlatform.entries()].sort())
  console.log(` ${pf}: ${days.length} open (days ${days.join(", ")})`);
console.log(
  `summary: ideas ${ideas.length} · fill_slots ${results.filter((r) => r.kind === "fill_slots").length} · new_idea ${results.filter((r) => r.kind === "new_idea").length} · slots consumed ${consumed.size}/${slots.length}`,
);
process.exit(0);
