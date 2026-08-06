/**
 * Subreddit profile shape + helpers — the SINGLE source of truth, kept here
 * (not in listening-schema) so it's client-safe: importing it never pulls the
 * Drizzle schema / pg-core into a client bundle. `listening-schema.ts` imports
 * the type for `ListeningSourceConfig.subreddits` and re-exports these for
 * server callers, so both sides share one definition.
 *
 * The AI-evaluated fields (stance/culture/risk/sanctioned path) are produced by
 * subreddit-eval.service and are RE-RUNNABLE (native-enrich pattern); the
 * voice/signal notes start as AI suggestions but are human-editable. All of it
 * feeds composeListeningSystemPrompt per-subreddit so a reply in r/AirBnBHosts
 * respects that sub's rules, not just the brand's generic voice.
 */

export const SUBREDDIT_STANCES = [
  "engage", // good fit, vendor participation welcome with disclosure
  "cautious", // engage sparingly / pure-value only — easy to misread as spam
  "observe", // watch for signal, but don't reply (low fit or unclear norms)
  "avoid", // hostile to vendor/AI content — replying risks removal/ban
] as const;
export type SubredditStance = (typeof SUBREDDIT_STANCES)[number];

export type SubredditProfile = {
  name: string; // canonical, no "r/" prefix
  enabled?: boolean; // include in scans (default true)

  // ---- AI-evaluated (re-runnable via subreddit-eval.service) ----
  stance?: SubredditStance; // recommended engagement posture
  cultureSummary?: string; // what the sub is + its norms, in a sentence or two
  riskFlags?: string[]; // e.g. "rule-7-ai", "bot-policed", "no-vendor-spam"
  sanctionedPath?: string; // how a vendor MAY participate, if any
  subscribers?: number; // from about.json, for context
  evaluatedAt?: string; // ISO — when the profile was last generated
  evaluatedModel?: string;

  // ---- Human voice/signal overrides (layered on the brand voice) ----
  voiceNotes?: string; // per-sub reply voice tweak
  signalNotes?: string; // per-sub what-counts-as-signal tweak
};

/** A subreddit as stored: a bare name (legacy) or a full profile. */
export type SubredditEntry = string | SubredditProfile;

/** Coerce either stored shape into a profile object. */
export function normalizeSubreddit(s: SubredditEntry): SubredditProfile {
  return typeof s === "string" ? { name: s } : s;
}
export function normalizeSubreddits(
  list: SubredditEntry[] | null | undefined,
): SubredditProfile[] {
  return (list ?? []).map(normalizeSubreddit);
}
/** Just the subreddit name, from either stored shape. */
export function subredditName(s: SubredditEntry): string {
  return typeof s === "string" ? s : s.name;
}

/** Names only, from a list in either stored shape. */
export function subredditNames(
  list: SubredditEntry[] | null | undefined,
): string[] {
  return (list ?? []).map(subredditName);
}

/** Full profile objects (alias of normalizeSubreddits, read-side naming). */
export const subredditProfiles = normalizeSubreddits;

/**
 * Reconcile an edited name list (e.g. from a textarea) with existing entries,
 * preserving the profile attached to any name that survived. New names become
 * bare profiles; removed names drop. Lets a plain names input coexist with the
 * rich AI-evaluated profiles without clobbering them on save.
 */
export function reconcileSubreddits(
  existing: SubredditEntry[] | null | undefined,
  names: string[],
): SubredditProfile[] {
  const byName = new Map(
    normalizeSubreddits(existing).map(
      (s) => [s.name.toLowerCase(), s] as const,
    ),
  );
  return names.map((name) => byName.get(name.toLowerCase()) ?? { name });
}
