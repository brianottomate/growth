import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { PILLARS } from "@/lib/pillars";
import {
  getPlatformFormat,
  platformFormatsFor,
} from "@/server/content/formats";
import type {
  PlanImportIdea,
  PlanImportSpot,
} from "@/server/db/plan-import-schema";

/**
 * Workbook parse + cluster — half of the paste→suggestions pipeline (matching
 * lives in plan-import-match.service).
 *
 * Deterministic-first: the paste is a spreadsheet TSV (quote-wrapped
 * multi-line cells), so a tokenizer + fuzzy header map recovers the columns
 * without a model. The ONE AI call does only the judgment work — which rows
 * are the same idea (the sheet writes "Aug 6 IG" and "Aug 7 TikTok" as two
 * rows of ONE concept), slug/format normalization — and returns ROW
 * REFERENCES, never caption text (the content-grouping `postIndexes`
 * pattern), so long captions never round-trip through the model.
 */

const MODEL = "claude-sonnet-4-6"; // house rule: generateText + Output.object

// ---- deterministic TSV layer ----------------------------------------------

export type WorkbookRow = {
  index: number;
  day: number | null; // day-of-month from the Day cell ("Aug 6", "August 1"…)
  monthHint: number | null; // 1-12 when the Day cell names a month
  platformsRaw: string;
  platforms: string[]; // normalized platform slugs
  pillarRaw: string | null;
  seriesRaw: string | null;
  concept: string | null;
  formatRaw: string | null;
  hook: string | null;
  captionDirection: string | null;
  captions: Partial<Record<"instagram" | "tiktok" | "youtube", string>>;
  visuals: string | null;
  cta: string | null;
  manychat: boolean | null;
  keyword: string | null;
  kpi: string | null;
  owner: string | null;
  status: string | null;
  finalAssets: string | null;
  links: string | null;
  utm: string | null;
  isJunk: boolean; // no day AND no concept → legend/blank/asset-scratch row
};

type ColumnKey =
  | "day"
  | "platform"
  | "pillar"
  | "series"
  | "concept"
  | "format"
  | "hook"
  | "captionDirection"
  | "captionInstagram"
  | "captionTiktok"
  | "captionYoutube"
  | "visuals"
  | "cta"
  | "manychat"
  | "keyword"
  | "kpi"
  | "owner"
  | "status"
  | "finalAssets"
  | "links"
  | "utm";

// Order matters: more specific caption headers before the generic ones, so
// "Caption Direction" doesn't get eaten by an instagram/tiktok matcher.
const HEADER_MATCHERS: [ColumnKey, RegExp][] = [
  ["day", /^day\b/i],
  ["platform", /platform/i],
  ["pillar", /pillar/i],
  ["series", /series/i],
  ["concept", /concept|idea/i],
  ["format", /^format/i],
  ["hook", /^hook/i],
  ["captionDirection", /caption\s*direction/i],
  ["captionInstagram", /caption\s*(insta|ig)/i],
  ["captionTiktok", /caption\s*(tt|tik)/i],
  ["captionYoutube", /caption\s*(yt|youtube|shorts)/i],
  ["visuals", /visual/i],
  ["cta", /^cta\b/i],
  ["manychat", /manychat/i],
  ["keyword", /keyword/i],
  ["kpi", /kpi/i],
  ["owner", /owner/i],
  ["status", /^status/i],
  ["finalAssets", /final\s*assets/i],
  ["links", /^links?\b/i],
  ["utm", /^utm/i],
];

/** Spreadsheet-paste TSV tokenizer: tab-separated, Excel-style quoted cells
 *  that may span newlines, `""` as an escaped quote. */
function tokenizeTsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Ported from scripts/import-content-calendar.ts, extended beyond the four
// platforms the old sheet used.
export function parsePlatforms(raw: string): string[] {
  const r = raw.toLowerCase();
  const out = new Set<string>();
  if (/\big\b|instagram/.test(r)) out.add("instagram");
  if (/tiktok|\btt\b/.test(r)) out.add("tiktok");
  if (r.includes("pinterest")) out.add("pinterest");
  if (/youtube|\byt\b|shorts/.test(r)) out.add("youtube");
  if (/linkedin|\bli\b/.test(r)) out.add("linkedin");
  if (/\bx\b|twitter/.test(r)) out.add("x");
  if (/facebook|\bfb\b/.test(r)) out.add("facebook");
  return [...out];
}

/** Fallback (platform, sheet format text) → format id, when the AI's pick
 *  isn't a valid registry id. Ported from the old import script. */
export function mapFormatFallback(
  platform: string,
  raw: string,
): string | null {
  const r = (raw || "").toLowerCase();
  const isCarousel = /carousel|carrousel|pins?\b|slides?/.test(r);
  const isStory = /story|stories/.test(r);
  const isVideo = /reel|video|b-roll|pov|talking/.test(r);
  switch (platform) {
    case "instagram":
      if (isStory) return "instagram.story";
      if (isCarousel && !isStory) return "instagram.carousel";
      return "instagram.reel";
    case "tiktok":
      return isCarousel ? "tiktok.photo" : "tiktok.video";
    case "pinterest":
      return r.includes("idea pin") ? "pinterest.idea_pin" : "pinterest.pin";
    case "youtube":
      return /long|video essay/.test(r) ? "youtube.video" : "youtube.short";
    case "linkedin":
      if (isVideo) return "linkedin.video";
      if (isCarousel) return "linkedin.document";
      return "linkedin.image";
    case "x":
      return isVideo ? "x.video" : "x.tweet";
    case "facebook":
      return isVideo ? "facebook.reel" : "facebook.image";
    default:
      return platformFormatsFor(platform as never)[0]?.id ?? null;
  }
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseDayCell(raw: string): {
  day: number | null;
  monthHint: number | null;
} {
  const t = raw.trim().toLowerCase();
  if (!t) return { day: null, monthHint: null };
  const dayMatch = /(\d{1,2})/.exec(t);
  const day = dayMatch ? Number(dayMatch[1]) : null;
  let monthHint: number | null = null;
  for (const [name, num] of Object.entries(MONTHS)) {
    if (t.includes(name)) {
      monthHint = num;
      break;
    }
  }
  return { day: day && day >= 1 && day <= 31 ? day : null, monthHint };
}

const URL_RE = /https?:\/\/[^\s)]+/g;
export function extractUrls(...parts: (string | null | undefined)[]): string[] {
  const text = parts.filter(Boolean).join("\n");
  return [...new Set(text.match(URL_RE) ?? [])];
}
export function stripUrls(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(URL_RE, "").replace(/\s+/g, " ").trim();
}

export function parseWorkbookRows(rawText: string): {
  rows: WorkbookRow[];
  headerMap: Partial<Record<ColumnKey, number>>;
} {
  const grid = tokenizeTsv(rawText);

  // Header = first row where at least 4 known headers register.
  let headerIdx = -1;
  let headerMap: Partial<Record<ColumnKey, number>> = {};
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const map: Partial<Record<ColumnKey, number>> = {};
    for (let c = 0; c < grid[i]!.length; c++) {
      const cell = grid[i]![c]!.trim();
      if (!cell) continue;
      const hit = HEADER_MATCHERS.find(([, re]) => re.test(cell));
      // First column wins per key (the sheet has a duplicate "Hook" column).
      if (hit && map[hit[0]] === undefined) map[hit[0]] = c;
    }
    if (Object.keys(map).length >= 4) {
      headerIdx = i;
      headerMap = map;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Could not find a workbook header row (Day/Platform/…)");
  }

  const cellAt = (cells: string[], key: ColumnKey): string | null => {
    const idx = headerMap[key];
    if (idx === undefined) return null;
    const v = (cells[idx] ?? "").trim();
    return v && v !== "—" && v !== "-" ? v : null;
  };

  const rows: WorkbookRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i]!;
    if (cells.every((c) => !c.trim())) continue; // fully blank line

    const dayCell = cellAt(cells, "day");
    const { day, monthHint } = parseDayCell(dayCell ?? "");
    const platformsRaw = cellAt(cells, "platform") ?? "";
    const concept = cellAt(cells, "concept");
    const manychatRaw = cellAt(cells, "manychat");
    const ctaRaw = cellAt(cells, "cta");

    const captions: WorkbookRow["captions"] = {};
    const capIg = cellAt(cells, "captionInstagram");
    const capTt = cellAt(cells, "captionTiktok");
    const capYt = cellAt(cells, "captionYoutube");
    if (capIg) captions.instagram = capIg;
    if (capTt) captions.tiktok = capTt;
    if (capYt) captions.youtube = capYt;

    rows.push({
      index: rows.length,
      day,
      monthHint,
      platformsRaw,
      platforms: parsePlatforms(platformsRaw),
      pillarRaw: cellAt(cells, "pillar"),
      seriesRaw: cellAt(cells, "series"),
      concept,
      formatRaw: cellAt(cells, "format"),
      hook: cellAt(cells, "hook"),
      captionDirection: cellAt(cells, "captionDirection"),
      captions,
      visuals: cellAt(cells, "visuals"),
      // The team sometimes parks stray caption text in the CTA column; a real
      // CTA is short. Long blobs still contribute URLs via extractUrls.
      cta: ctaRaw && ctaRaw.length <= 200 ? ctaRaw : null,
      manychat: manychatRaw
        ? /^y/i.test(manychatRaw)
          ? true
          : /^n/i.test(manychatRaw)
            ? false
            : null
        : null,
      keyword: cellAt(cells, "keyword"),
      kpi: cellAt(cells, "kpi"),
      owner: cellAt(cells, "owner"),
      status: cellAt(cells, "status"),
      finalAssets: cellAt(cells, "finalAssets"),
      links: cellAt(cells, "links"),
      utm: cellAt(cells, "utm"),
      isJunk: !day && !concept,
    });
  }

  return { rows, headerMap };
}

// ---- AI cluster layer ------------------------------------------------------

export type ClusterInput = {
  rows: WorkbookRow[];
  month: string; // "YYYY-MM" — the plan's target month
  brandSlug: string;
  members: { id: string; name: string | null }[];
  knownSeries: string[];
};

export type ClusterOutput = {
  ideas: PlanImportIdea[];
  droppedRowIndexes: number[];
  unclusteredRowIndexes: number[]; // non-junk rows neither clustered nor dropped
};

const CAPTION_COLUMNS = [
  "instagram",
  "tiktok",
  "youtube",
  "direction",
] as const;

function rowDigest(r: WorkbookRow): string {
  const caps = (["instagram", "tiktok", "youtube"] as const)
    .filter((k) => r.captions[k])
    .map((k) => `${k}:${r.captions[k]!.length}ch`)
    .join(",");
  return [
    `#${r.index}`,
    r.isJunk ? "JUNK?" : null,
    `day:${r.day ?? "?"}`,
    `pf:${r.platformsRaw || "?"}`,
    r.pillarRaw ? `pillar:${r.pillarRaw}` : null,
    r.seriesRaw ? `series:${r.seriesRaw}` : null,
    r.formatRaw ? `fmt:${r.formatRaw}` : null,
    `concept:${r.concept ?? "—"}`,
    r.hook ? `hook:${r.hook.slice(0, 70)}` : null,
    caps ? `captions[${caps}]` : null,
    r.manychat != null ? `manychat:${r.manychat ? "YES" : "NO"}` : null,
    r.keyword ? `kw:${r.keyword}` : null,
    r.owner ? `owner:${r.owner}` : null,
    r.status ? `status:${r.status}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function clusterWorkbookRows(
  opts: ClusterInput,
): Promise<ClusterOutput> {
  const { rows, month, brandSlug, members, knownSeries } = opts;
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);

  const pillarSlugs = PILLARS.filter((p) => p.brandSlug === brandSlug).map(
    (p) => p.slug,
  );
  if (pillarSlugs.length === 0) pillarSlugs.push(...PILLARS.map((p) => p.slug));

  const platformEnum = [
    "instagram",
    "tiktok",
    "youtube",
    "pinterest",
    "linkedin",
    "x",
    "facebook",
    "threads",
  ] as const;
  const formatIdsByPlatform = platformEnum
    .map(
      (p) =>
        `${p}: ${platformFormatsFor(p as never)
          .map((f) => f.id)
          .join(", ")}`,
    )
    .join("\n");

  const clusterIdeaSchema = z.object({
    rowIndexes: z
      .array(z.number().int())
      .min(1)
      .describe(
        "0-based indexes of the parsed rows that are ONE idea. The same concept posted to different platforms counts as one idea — even when the rows sit on adjacent days (a TikTok cut of Monday's IG post is the same idea).",
      ),
    title: z
      .string()
      .describe(
        "Canonical concept title — clean, no platform suffixes like '— TikTok cut'.",
      ),
    date: z
      .string()
      .nullable()
      .describe("YYYY-MM-DD. The EARLIEST day across the clustered rows."),
    pillar: z.enum(pillarSlugs as [string, ...string[]]).nullable(),
    seriesName: z
      .string()
      .nullable()
      .describe(
        "Series display name. Reuse a known series name when it is clearly the same series.",
      ),
    ownerName: z.string().nullable(),
    ctaKeyword: z
      .string()
      .nullable()
      .describe(
        "The ManyChat comment-trigger keyword — ONLY when ManyChat is YES.",
      ),
    spots: z
      .array(
        z.object({
          platform: z.enum(platformEnum),
          format: z
            .string()
            .describe(
              "A VALID registry format id for that platform (see the list in the prompt).",
            ),
          template: z
            .string()
            .nullable()
            .describe(
              "Editorial structure when obvious: pov, talking_head, gallery, listicle, …",
            ),
          date: z
            .string()
            .nullable()
            .describe(
              "YYYY-MM-DD, ONLY when this platform ships on a DIFFERENT day than the idea date.",
            ),
          captionRowIndex: z
            .number()
            .int()
            .nullable()
            .describe(
              "The row whose caption cell holds this platform's caption.",
            ),
          captionColumn: z.enum(CAPTION_COLUMNS).nullable(),
        }),
      )
      .min(1),
    reasoning: z.string().describe("One sentence on the clustering decision."),
  });

  const clusterOutputSchema = z.object({
    ideas: z.array(clusterIdeaSchema),
    droppedRowIndexes: z
      .array(z.number().int())
      .describe(
        "Junk rows to ignore: legends, blanks, stray asset filenames with no plannable concept.",
      ),
  });

  const system = [
    "You normalize a social content team's monthly planning spreadsheet into structured ideas.",
    "Each parsed row is one SHEET ROW, but rows are NOT ideas: the same concept posted to several platforms appears as several rows — sometimes on adjacent days. Cluster such rows into ONE idea with one spot per platform.",
    "A row whose Platform cell lists several platforms (e.g. 'IG · TikTok · YT Shorts') is one idea with one spot per listed platform.",
    "Return ROW REFERENCES for captions (captionRowIndex + captionColumn) — never copy caption text.",
    `Target month: ${month} (year ${year}, month ${monthNum}).`,
    `Valid pillar slugs: ${pillarSlugs.join(", ")}. Map the sheet's display names (e.g. "Inspiration" → travel-inspiration, "Brand & Trust" → brand-trust).`,
    `Valid format ids per platform:\n${formatIdsByPlatform}`,
    `Known existing series names: ${knownSeries.join(" · ") || "(none)"}.`,
    "Rows flagged JUNK? are probably ignorable — but a row with a real concept and an asset file may still be a plannable (undated) idea; use judgment.",
  ].join("\n\n");

  const prompt = [
    "Parsed rows:",
    ...rows.map(rowDigest),
    "",
    "Cluster every non-junk row into ideas (or drop it) now.",
  ].join("\n");

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: clusterOutputSchema }),
    system,
    prompt,
    temperature: 0.2,
  });

  // ---- deterministic stitch + repair ----
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  const claimed = new Set<number>();
  const dropped = new Set(
    output.droppedRowIndexes.filter((i) => byIndex.has(i)),
  );

  const memberMatch = (name: string | null): string | null => {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const hit = members.find((m) => {
      const mn = (m.name ?? "").toLowerCase();
      return mn === n || mn.includes(n) || n.includes(mn.split(" ")[0] ?? " ");
    });
    return hit?.id ?? null;
  };

  const validDate = (s: string | null | undefined): string | null => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Number.isNaN(new Date(s).getTime()) ? null : s;
  };
  const dateFromDay = (day: number | null): string | null =>
    day
      ? `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;

  const firstNonEmpty = (
    cluster: WorkbookRow[],
    pick: (r: WorkbookRow) => string | null,
  ): string | null => {
    for (const r of cluster) {
      const v = pick(r);
      if (v) return v;
    }
    return null;
  };

  const ideas: PlanImportIdea[] = [];

  const buildIdea = (
    cluster: WorkbookRow[],
    ai: z.infer<typeof clusterIdeaSchema> | null,
  ): PlanImportIdea => {
    const lead = cluster[0]!;
    const allIndexes = cluster.map((r) => r.index);
    const manychat = cluster.some((r) => r.manychat === true);
    const ownerName = ai?.ownerName ?? firstNonEmpty(cluster, (r) => r.owner);

    // Spots: from the AI when present, else deterministic fan-out of the
    // cluster's platform tokens.
    const spotDefs: PlanImportSpot[] = [];
    const seenPlatforms = new Set<string>();
    const aiSpots = ai?.spots ?? [];
    const fallbackPlatforms = [
      ...new Set(cluster.flatMap((r) => r.platforms)),
    ].map((platform) => ({
      platform,
      fromRow: cluster.find((r) => r.platforms.includes(platform))!,
    }));

    const resolveCaption = (
      platform: string,
      rowIndex: number | null,
      column: (typeof CAPTION_COLUMNS)[number] | null,
    ): string | null => {
      if (rowIndex != null && column) {
        const r = byIndex.get(rowIndex);
        if (r) {
          const v =
            column === "direction"
              ? r.captionDirection
              : (r.captions[column] ?? null);
          if (v) return v;
        }
      }
      // Fallback: first caption for this platform anywhere in the cluster.
      const key = platform as "instagram" | "tiktok" | "youtube";
      return firstNonEmpty(cluster, (r) => r.captions[key] ?? null);
    };

    for (const s of aiSpots) {
      if (seenPlatforms.has(s.platform)) continue;
      seenPlatforms.add(s.platform);
      const fmtRaw = firstNonEmpty(cluster, (r) => r.formatRaw) ?? "";
      const valid = getPlatformFormat(s.format);
      const format =
        valid?.platform === s.platform
          ? valid.id
          : (mapFormatFallback(s.platform, fmtRaw) ??
            platformFormatsFor(s.platform)[0]?.id ??
            null);
      if (!format) continue;
      spotDefs.push({
        platform: s.platform,
        format,
        archetype: getPlatformFormat(format)?.archetype ?? "image",
        template: s.template,
        caption: resolveCaption(s.platform, s.captionRowIndex, s.captionColumn),
        date: validDate(s.date),
        sourceRowIndexes:
          s.captionRowIndex != null && byIndex.has(s.captionRowIndex)
            ? [s.captionRowIndex]
            : allIndexes,
      });
    }
    for (const { platform, fromRow } of fallbackPlatforms) {
      if (seenPlatforms.has(platform)) continue;
      seenPlatforms.add(platform);
      const format = mapFormatFallback(platform, fromRow.formatRaw ?? "");
      if (!format) continue;
      spotDefs.push({
        platform,
        format,
        archetype: getPlatformFormat(format)?.archetype ?? "image",
        template: null,
        caption: resolveCaption(platform, fromRow.index, null),
        date: fromRow.day !== lead.day ? dateFromDay(fromRow.day) : null,
        sourceRowIndexes: [fromRow.index],
      });
    }

    const realDays = cluster
      .map((r) => r.day)
      .filter((d): d is number => d != null);
    return {
      title: ai?.title ?? lead.concept ?? "Untitled",
      date:
        validDate(ai?.date) ??
        (realDays.length ? dateFromDay(Math.min(...realDays)) : null),
      pillar: ai?.pillar ?? null,
      seriesName: ai?.seriesName ?? firstNonEmpty(cluster, (r) => r.seriesRaw),
      hook: firstNonEmpty(cluster, (r) => r.hook),
      captionDirection: firstNonEmpty(cluster, (r) => r.captionDirection),
      visualDirection:
        stripUrls(firstNonEmpty(cluster, (r) => r.visuals)) || null,
      ctaText: firstNonEmpty(cluster, (r) => r.cta),
      ctaKeyword: manychat
        ? (ai?.ctaKeyword ?? firstNonEmpty(cluster, (r) => r.keyword))
        : null,
      kpi: firstNonEmpty(cluster, (r) => r.kpi),
      ownerName,
      ownerId: memberMatch(ownerName),
      sheetStatus: firstNonEmpty(cluster, (r) => r.status),
      assetLinks: extractUrls(
        ...cluster.flatMap((r) => [r.visuals, r.finalAssets, r.links]),
      ),
      utm: firstNonEmpty(cluster, (r) => r.utm),
      spots: spotDefs,
      sourceRowIndexes: allIndexes,
    };
  };

  for (const ai of output.ideas) {
    const cluster = ai.rowIndexes
      .filter((i) => byIndex.has(i) && !claimed.has(i) && !dropped.has(i))
      .map((i) => byIndex.get(i)!)
      .sort((a, b) => a.index - b.index);
    if (!cluster.length) continue;
    for (const r of cluster) claimed.add(r.index);
    ideas.push(buildIdea(cluster, ai));
  }

  // Non-junk rows the model neither clustered nor dropped become single-row
  // fallback ideas — surfaced, never silently lost.
  const unclustered = rows.filter(
    (r) => !r.isJunk && !claimed.has(r.index) && !dropped.has(r.index),
  );
  for (const r of unclustered) {
    if (r.platforms.length === 0 && !r.concept) continue;
    claimed.add(r.index);
    ideas.push(buildIdea([r], null));
  }

  ideas.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  return {
    ideas,
    droppedRowIndexes: [...dropped],
    unclusteredRowIndexes: unclustered.map((r) => r.index),
  };
}
