/**
 * Bright Data scraper discovery harness.
 *
 * Runs a Bright Data dataset "scrape" (synchronous) and prints what comes back
 * — record count, the union of keys, media coverage, post-type breakdown, and a
 * full sample of the first post that carries media — plus dumps the raw JSONL to
 * `scripts/.brightdata-<key>.json` for offline inspection.
 *
 * This is a LAY-OF-THE-LAND tool: it exists to discover each scraper's response
 * shape so we can design the `platform_post` mapping. Not production code.
 *
 *   bun run scripts/brightdata-scrape-test.ts                 # list scrapers
 *   bun run scripts/brightdata-scrape-test.ts linkedin        # run one
 *   bun run scripts/brightdata-scrape-test.ts all             # run all
 *
 * Token: reads BRIGHT_DATA_API_KEY from the environment.
 */

import { writeFileSync } from "node:fs";

const TOKEN = process.env.BRIGHT_DATA_API_KEY;
if (!TOKEN) throw new Error("BRIGHT_DATA_API_KEY is not set");

const BASE = "https://api.brightdata.com/datasets/v3/scrape";

type Scraper = {
  /** Human label / platform_post.platform target. */
  label: string;
  datasetId: string;
  /** Extra query params (e.g. discover_new). */
  query?: Record<string, string>;
  /** Bright Data `input` array. Defaults focus on Airbnb where possible. */
  input: Array<Record<string, unknown>>;
  note?: string;
};

// Each entry = one Bright Data dataset + the input shape the user supplied.
// Airbnb is the focus; item-level scrapers (IG post, TikTok video) keep the
// user's sample URLs since we don't have Airbnb item URLs yet.
const SCRAPERS: Record<string, Scraper> = {
  linkedin: {
    label: "linkedin (company posts)",
    datasetId: "gd_lyy3tktm25m4avu764",
    query: { type: "discover_new", discover_by: "company_url" },
    input: [{ url: "https://www.linkedin.com/company/airbnb" }],
  },
  "instagram-profile": {
    label: "instagram (profile → recent posts)",
    datasetId: "gd_l1vikfch901nx3by4",
    input: [{ url: "https://www.instagram.com/airbnb/" }],
  },
  "instagram-post": {
    label: "instagram (single post by url)",
    datasetId: "gd_lk5ns7kz21pck8jpis",
    input: [{ url: "https://www.instagram.com/p/Cuf4s0MNqNr" }],
    note: "item-level: needs a specific post URL (sample, not Airbnb)",
  },
  x: {
    label: "x (profile posts)",
    datasetId: "gd_lwxkxvnf1cynvib9co",
    query: { type: "discover_new", discover_by: "profile_url" },
    input: [{ url: "https://x.com/airbnb", start_date: "", end_date: "" }],
  },
  tiktok: {
    label: "tiktok (single video by url)",
    datasetId: "gd_lu702nij2f790tmv9h",
    input: [
      {
        url: "https://www.tiktok.com/@mrbeast/video/7553327774983802143",
        country: "",
      },
    ],
    note: "item-level: needs a specific video URL (sample, not Airbnb)",
  },
  facebook: {
    label: "facebook (page posts)",
    datasetId: "gd_lkaxegm826bjpoo9m5",
    input: [
      {
        url: "https://www.facebook.com/airbnb/",
        num_of_posts: 50,
        start_date: "",
        end_date: "",
      },
    ],
  },
};

// Fields that commonly hold media across platforms.
const MEDIA_KEYS = [
  "image",
  "images",
  "img",
  "photos",
  "photo",
  "display_url",
  "thumbnail",
  "video",
  "videos",
  "video_url",
  "video_thumbnail",
  "media",
  "attachments",
  "media_url",
  "post_image",
];

function truncate(value: unknown, max = 200): unknown {
  if (typeof value === "string")
    return value.length > max
      ? value.slice(0, max) + `…(${value.length})`
      : value;
  if (Array.isArray(value))
    return value
      .slice(0, 2)
      .map((v) => truncate(v, max))
      .concat(value.length > 2 ? [`…(+${value.length - 2} more)`] : []);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncate(v, max);
    return out;
  }
  return value;
}

const hasVal = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v != null && v !== "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Slow datasets (LinkedIn, X, Facebook) return 202 + a snapshot_id from the
 * sync /scrape endpoint. Poll progress, then download the finished snapshot.
 */
async function fetchSnapshot(snapshotId: string): Promise<unknown[]> {
  const auth = { Authorization: `Bearer ${TOKEN}` };
  for (let i = 0; i < 60; i++) {
    const prog = await fetch(
      `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
      { headers: auth },
    ).then((r) => r.json() as Promise<{ status?: string }>);
    if (prog.status === "ready") break;
    if (prog.status === "failed")
      throw new Error(`snapshot ${snapshotId} failed`);
    process.stdout.write(`  …${prog.status ?? "running"} (${i})\r`);
    await sleep(5000);
  }
  const text = await fetch(
    `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
    { headers: auth },
  ).then((r) => r.text());
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
  } catch {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  }
}

function mediaKeysPresent(o: Record<string, unknown>): string[] {
  return Object.keys(o).filter(
    (k) => MEDIA_KEYS.includes(k.toLowerCase()) && hasVal(o[k]),
  );
}

async function runScraper(key: string, s: Scraper) {
  const qs = new URLSearchParams({
    dataset_id: s.datasetId,
    notify: "false",
    include_errors: "true",
    ...(s.query ?? {}),
  });
  const endpoint = `${BASE}?${qs.toString()}`;

  console.log(`\n############ ${key} — ${s.label} ############`);
  console.log(`dataset ${s.datasetId}${s.note ? `  (${s.note})` : ""}`);

  const started = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: s.input }),
  });
  const text = await res.text();
  console.log(
    `HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
  if (!res.ok) {
    console.log("Body:", text.slice(0, 1500));
    return;
  }

  let records: unknown[];
  try {
    const parsed: unknown = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    records = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  }

  // Async datasets return a snapshot_id (202) — poll + download.
  const snap = (records[0] as { snapshot_id?: string } | undefined)
    ?.snapshot_id;
  if (snap) {
    console.log(`  async snapshot ${snap} — polling…`);
    records = await fetchSnapshot(snap);
    console.log(`  downloaded ${records.length} records`);
  }

  writeFileSync(
    `scripts/.brightdata-${key}.json`,
    JSON.stringify(records, null, 2),
  );

  const objs = records.filter(
    (r): r is Record<string, unknown> => !!r && typeof r === "object",
  );
  const errs = objs.filter((o) => o.error ?? o.error_code);
  const posts = objs.filter((o) => !(o.error ?? o.error_code));

  console.log(
    `records: ${records.length}  (posts: ${posts.length}, errors: ${errs.length})`,
  );
  if (errs[0]) console.log(`  sample error: ${String(errs[0].error)}`);

  const keys = new Set<string>();
  for (const p of posts) for (const k of Object.keys(p)) keys.add(k);
  console.log(`keys (${keys.size}): ${[...keys].join(", ")}`);

  const mediaCounts: Record<string, number> = {};
  for (const p of posts)
    for (const k of mediaKeysPresent(p))
      mediaCounts[k] = (mediaCounts[k] ?? 0) + 1;
  console.log(`media-bearing fields:`, mediaCounts);

  const withMedia = posts.find((p) => mediaKeysPresent(p).length > 0);
  console.log("sample post (with media if any):");
  console.log(
    JSON.stringify(truncate(withMedia ?? posts[0] ?? errs[0] ?? {}), null, 2),
  );
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Usage: bun run scripts/brightdata-scrape-test.ts <key|all>");
    console.log("Scrapers:");
    for (const [k, s] of Object.entries(SCRAPERS))
      console.log(`  ${k.padEnd(18)} ${s.label}`);
    return;
  }
  const keys = arg === "all" ? Object.keys(SCRAPERS) : [arg];
  for (const k of keys) {
    const s = SCRAPERS[k];
    if (!s) {
      console.log(`Unknown scraper "${k}". Run with no args to list.`);
      continue;
    }
    try {
      await runScraper(k, s);
    } catch (e) {
      console.log(`${k} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
