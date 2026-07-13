import "server-only";

import { env } from "@/env";

/**
 * Bright Data dataset client — scrapes competitor/peer social posts + profiles.
 *
 * The sync `/scrape` endpoint blocks ~60–90s; slow datasets (LinkedIn, X,
 * Facebook) instead return `202` + a `snapshot_id` we poll (`/progress`) and
 * download (`/snapshot`). `runScrape` hides that difference.
 *
 * Dataset shapes were verified against live Airbnb runs — see
 * docs/brightdata-peer-scraping.md.
 */

export const isBrightDataConfigured = !!env.BRIGHT_DATA_API_KEY;

const BASE = "https://api.brightdata.com/datasets/v3";

// ---- DATASET REGISTRY ----------------------------------------------

type ScraperKey =
  | "linkedinPosts"
  | "linkedinProfile"
  | "linkedinPersonProfile"
  | "instagramProfile"
  | "instagramPost"
  | "xPosts"
  | "tiktokPost"
  | "facebookPosts";

type ScraperDef = {
  datasetId: string;
  query?: Record<string, string>;
};

const SCRAPERS: Record<ScraperKey, ScraperDef> = {
  linkedinPosts: {
    datasetId: "gd_lyy3tktm25m4avu764",
    query: { type: "discover_new", discover_by: "company_url" },
  },
  // Company/school/showcase pages — rejects personal /in/ URLs.
  linkedinProfile: { datasetId: "gd_l1vikfnt1wgvvqz95w" },
  // People profiles (/in/…) — the trust-layer person lookup.
  linkedinPersonProfile: { datasetId: "gd_l1viktl72bvl7bjuj0" },
  instagramProfile: { datasetId: "gd_l1vikfch901nx3by4" },
  instagramPost: { datasetId: "gd_lk5ns7kz21pck8jpis" },
  xPosts: {
    datasetId: "gd_lwxkxvnf1cynvib9co",
    query: { type: "discover_new", discover_by: "profile_url" },
  },
  tiktokPost: { datasetId: "gd_lu702nij2f790tmv9h" },
  facebookPosts: { datasetId: "gd_lkaxegm826bjpoo9m5" },
};

function requireToken(): string {
  if (!env.BRIGHT_DATA_API_KEY) {
    throw new Error("Bright Data is not configured — set BRIGHT_DATA_API_KEY.");
  }
  return env.BRIGHT_DATA_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollSnapshot(
  snapshotId: string,
  token: string,
  maxAttempts = 120,
): Promise<unknown[]> {
  const auth = { Authorization: `Bearer ${token}` };
  for (let i = 0; i < maxAttempts; i++) {
    const prog = (await fetch(`${BASE}/progress/${snapshotId}`, {
      headers: auth,
    }).then((r) => r.json())) as { status?: string };
    if (prog.status === "ready") break;
    if (prog.status === "failed")
      throw new Error(`snapshot ${snapshotId} failed`);
    await sleep(5000);
  }
  const text = await fetch(`${BASE}/snapshot/${snapshotId}?format=json`, {
    headers: auth,
  }).then((r) => r.text());
  return parseRecords(text);
}

function parseRecords(text: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  }
}

/**
 * Run a registered scraper to completion and return its records.
 *
 * Uses the async `/trigger` endpoint (returns a snapshot_id we poll) for ALL
 * datasets — the sync `/scrape` endpoint is unreliable here: it ECONNRESETs on
 * slow profile crawls (IG) and rejects some datasets outright. `/trigger` is the
 * robust path for both fast and slow datasets.
 *
 * `limitPerInput` caps records per input URL — the main cost lever for the
 * post crawlers (e.g. X can return 750+ tweets unbounded).
 *
 * Throws if EVERY returned record is a crawler error (e.g. a dataset that's
 * down), so callers surface a real failure instead of silently ingesting zero.
 */
export async function runScrape(
  key: ScraperKey,
  input: Array<Record<string, unknown>>,
  opts?: {
    limitPerInput?: number;
    query?: Record<string, string>;
    maxPollAttempts?: number;
  },
): Promise<unknown[]> {
  const token = requireToken();
  const def = SCRAPERS[key];
  const qs = new URLSearchParams({
    dataset_id: def.datasetId,
    notify: "false",
    include_errors: "true",
    ...(def.query ?? {}),
    // Per-call overrides (e.g. discover_by=profile_url for a personal LinkedIn
    // profile vs the registry default company_url).
    ...(opts?.query ?? {}),
    ...(opts?.limitPerInput
      ? { limit_per_input: String(opts.limitPerInput) }
      : {}),
  });

  const res = await fetch(`${BASE}/trigger?${qs.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      `Bright Data ${key} ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  const trigger = (await res.json()) as { snapshot_id?: string };
  if (!trigger.snapshot_id) {
    throw new Error(`Bright Data ${key}: no snapshot_id from trigger`);
  }
  const records = await pollSnapshot(
    trigger.snapshot_id,
    token,
    opts?.maxPollAttempts,
  );

  // A dataset that's down returns only error rows ({error, error_code}). Real
  // runs can carry one leading error row + good rows — only throw if ALL fail.
  if (
    records.length > 0 &&
    records.every((r) => !!(r as { error?: unknown })?.error)
  ) {
    const msg = (records[0] as { error?: string }).error ?? "unknown error";
    throw new Error(`Bright Data ${key}: ${msg}`);
  }
  return records;
}

// ---- PROFILE VERIFICATION ------------------------------------------

export type ProfileVerification = {
  exists: boolean;
  followerCount?: number;
  handle?: string;
  profileImageUrl?: string;
};

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

// Per-platform capability: which dataset + how to read follower count.
// Only platforms with a cheap profile-level dataset are verified here; the
// others (x, facebook, tiktok, …) carry only an async post-crawl, so we defer
// their verification to the first real post scrape.
const VERIFY: Partial<
  Record<
    string,
    {
      key: ScraperKey;
      extract: (rec: Record<string, unknown>) => ProfileVerification;
    }
  >
> = {
  instagram: {
    key: "instagramProfile",
    extract: (r) => ({
      exists: !r.error && !!r.account,
      followerCount: typeof r.followers === "number" ? r.followers : undefined,
      handle: typeof r.account === "string" ? r.account : undefined,
      profileImageUrl: firstString(r, [
        "profile_image_link",
        "profile_image_url",
        "profile_pic_url_hd",
        "profile_pic_url",
      ]),
    }),
  },
  linkedin: {
    key: "linkedinProfile",
    extract: (r) => ({
      exists: !r.error && !!(r.name ?? r.id),
      followerCount: typeof r.followers === "number" ? r.followers : undefined,
      handle: typeof r.id === "string" ? r.id : undefined,
      profileImageUrl: firstString(r, ["logo", "avatar", "profile_image_url"]),
    }),
  },
};

/** True if we can verify a profile for this platform via a profile dataset. */
export function canVerify(platform: string): boolean {
  return isBrightDataConfigured && platform in VERIFY;
}

/**
 * Verify a profile URL resolves and pull its follower count. Returns null for
 * platforms we don't have a profile dataset for (caller treats as unverified).
 */
export async function verifyProfile(
  platform: string,
  profileUrl: string,
): Promise<ProfileVerification | null> {
  const cfg = VERIFY[platform];
  if (!cfg) return null;
  // No limit_per_input: the profile datasets return a single record, and that
  // param has been observed to drop the connection on these endpoints.
  const records = await runScrape(cfg.key, [{ url: profileUrl }]);
  const rec = records.find((r) => r && typeof r === "object") as
    | Record<string, unknown>
    | undefined;
  if (!rec) return { exists: false };
  return cfg.extract(rec);
}

// ---- LINKEDIN PERSON PROFILE (trust layer) -------------------------

export type LinkedinProfile = {
  url: string;
  name: string | null;
  currentCompany: string | null;
  city: string | null;
};

/**
 * Scrape a LinkedIn *person* profile and extract their current employer, so the
 * trust layer can confirm "does this person actually work here?". The dataset
 * keys vary by record, so current-company is read defensively (object → flat
 * field → first experience entry). Returns null when the profile can't be read.
 */
export async function scrapeLinkedinProfile(
  url: string,
): Promise<LinkedinProfile | null> {
  // People-profile dataset (not the company one). Bounded poll (~2min) so a
  // slow profile doesn't hang the inline verify mutation — caller treats a
  // null/timeout as "couldn't confirm" rather than failing the whole row.
  const records = await runScrape("linkedinPersonProfile", [{ url }], {
    maxPollAttempts: 24,
  });
  const rec = records.find(
    (r) => r && typeof r === "object" && !(r as { error?: unknown }).error,
  ) as Record<string, unknown> | undefined;
  if (!rec) return null;

  let currentCompany: string | null = null;
  const cc = rec.current_company;
  if (cc && typeof cc === "object") {
    currentCompany = (cc as { name?: string }).name ?? null;
  } else if (typeof rec.current_company_name === "string") {
    currentCompany = rec.current_company_name;
  } else if (Array.isArray(rec.experience) && rec.experience.length > 0) {
    const first = rec.experience[0] as { company?: string };
    currentCompany = first?.company ?? null;
  }

  return {
    url,
    name: typeof rec.name === "string" ? rec.name : null,
    currentCompany,
    city: typeof rec.city === "string" ? rec.city : null,
  };
}
