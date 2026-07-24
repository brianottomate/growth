import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

import {
  playbookContextBlock,
  playbooksByKind,
} from "@/server/ai/playbooks";
import {
  SUBREDDIT_STANCES,
  type SubredditProfile,
} from "@/server/db/listening-schema";

/**
 * Subreddit evaluation — turn a bare subreddit name into an AI-evaluated
 * {@link SubredditProfile}: its culture, the risk of a vendor/AI reply, the
 * sanctioned path for participation (if any), a recommended engagement stance,
 * and starter voice/signal notes. Re-runnable (native-enrich pattern): call it
 * again to refresh as a sub's rules change.
 *
 * Grounded in real signals (the sub's public description + rules, pulled from
 * Reddit's JSON) AND in what Wander actually sells (productContextBlock), so the
 * fit/risk judgment is concrete rather than generic. This is the per-subreddit
 * analog of capient's per-company brand profile.
 */

const EVAL_MODEL = anthropic("claude-sonnet-5");

const USER_AGENT =
  "web:wandercom-growth-reddit-monitor:0.1.0 (by /u/homi-scout-bot)";

interface SubredditAbout {
  public_description?: string;
  description?: string; // sidebar markdown
  title?: string;
  subscribers?: number;
  over18?: boolean;
}

interface SubredditRule {
  short_name?: string;
  description?: string;
}

/** Best-effort fetch of a subreddit's about + rules. Either may be empty. */
async function fetchSubredditMeta(
  name: string,
): Promise<{ about: SubredditAbout | null; rules: SubredditRule[] }> {
  const headers = { "User-Agent": USER_AGENT };
  const [aboutRes, rulesRes] = await Promise.allSettled([
    fetch(`https://www.reddit.com/r/${name}/about.json`, {
      headers,
      cache: "no-store",
    }),
    fetch(`https://www.reddit.com/r/${name}/about/rules.json`, {
      headers,
      cache: "no-store",
    }),
  ]);

  let about: SubredditAbout | null = null;
  if (aboutRes.status === "fulfilled" && aboutRes.value.ok) {
    const json = (await aboutRes.value.json()) as { data?: SubredditAbout };
    about = json.data ?? null;
  }

  let rules: SubredditRule[] = [];
  if (rulesRes.status === "fulfilled" && rulesRes.value.ok) {
    const json = (await rulesRes.value.json()) as { rules?: SubredditRule[] };
    rules = json.rules ?? [];
  }

  return { about, rules };
}

const EVAL_SYSTEM_PROMPT = `You are a growth strategist at Wander evaluating a subreddit as a place to engage organically.

Wander's products (for judging fit) are described below. Wander participates on Reddit as an OPENLY-BRANDED vendor account that always discloses affiliation — so the central question is not just "is there signal here" but "can a disclosed Wander employee reply here without it reading as spam or breaking the rules".

Judge honestly and conservatively:
- The best fit is a sub where operators discuss direct booking, OTA fees, PMS pain, or switching tools, AND where helpful disclosed-vendor comments are tolerated.
- Down-rank subs that are anti-AI, anti-self-promotion, heavily bot-policed, or where the only sanctioned vendor path is paid/promoted posts. A removal or ban on an openly-branded account is a real cost.
- "sanctionedPath" should name the rule-compliant way to participate if one exists (e.g. "promoted ads only", "value-only comments with disclosure", "AMA via mod approval") or be omitted if there is no safe organic path.

# Wander product context
${playbookContextBlock(playbooksByKind("product-reference"))}`;

const EvalSchema = z.object({
  stance: z
    .enum(SUBREDDIT_STANCES)
    .describe(
      "engage = good fit, disclosed vendor comments welcome. cautious = engage sparingly / pure-value only. observe = watch for signal but don't reply. avoid = hostile to vendor/AI content; replying risks removal or ban.",
    ),
  cultureSummary: z
    .string()
    .describe(
      "1-2 sentences: what this sub is, who's in it, and its norms around self-promotion / vendors / AI.",
    ),
  riskFlags: z
    .array(z.string())
    .describe(
      "Short kebab-case risk labels grounded in the rules/culture, e.g. 'rule-7-ai', 'bot-policed', 'no-vendor-spam', 'mods-strict', 'low-fit'. Empty if genuinely low-risk.",
    ),
  sanctionedPath: z
    .string()
    .nullable()
    .describe(
      "The rule-compliant way for a disclosed vendor to participate, or null if there is no safe organic path.",
    ),
  voiceNotes: z
    .string()
    .describe(
      "Concrete guidance for how a Wander reply should sound HERE specifically (layered on the brand voice) — e.g. how heavy the disclosure, how operator-peer vs. analytical, what to never do.",
    ),
  signalNotes: z
    .string()
    .describe(
      "What counts as a worth-engaging post in THIS sub specifically, layered on the brand's general signal guidance.",
    ),
});

/**
 * Evaluate one subreddit. Returns a full profile (the AI fields merged with
 * name/subscribers/provenance). Never throws on a missing sub — falls back to a
 * conservative 'observe' profile so the caller can still persist + edit it.
 */
export async function evaluateSubreddit(
  name: string,
): Promise<SubredditProfile> {
  const clean = name.replace(/^\/?r\//i, "").trim();
  const { about, rules } = await fetchSubredditMeta(clean);

  const metaBlock = [
    about?.title ? `Title: ${about.title}` : null,
    about?.public_description
      ? `Public description: ${about.public_description}`
      : null,
    about?.description
      ? `Sidebar: ${about.description.replace(/\s+/g, " ").slice(0, 1500)}`
      : null,
    typeof about?.subscribers === "number"
      ? `Subscribers: ${about.subscribers}`
      : null,
    rules.length
      ? `Rules:\n${rules
          .map(
            (r, i) =>
              `  ${i + 1}. ${r.short_name ?? "(rule)"}${
                r.description
                  ? ` — ${r.description.replace(/\s+/g, " ").slice(0, 300)}`
                  : ""
              }`,
          )
          .join("\n")}`
      : "Rules: (none retrieved)",
  ]
    .filter(Boolean)
    .join("\n");

  const { output: evaluated } = await generateText({
    model: EVAL_MODEL,
    system: EVAL_SYSTEM_PROMPT,
    prompt: `Evaluate r/${clean} as a place for Wander to engage organically.\n\nWhat we know about the subreddit:\n${
      metaBlock || "(no metadata could be retrieved — judge from the name alone and flag the uncertainty)"
    }`,
    output: Output.object({ schema: EvalSchema }),
  });

  return {
    name: clean,
    enabled: true,
    stance: evaluated.stance,
    cultureSummary: evaluated.cultureSummary,
    riskFlags: evaluated.riskFlags,
    sanctionedPath: evaluated.sanctionedPath ?? undefined,
    voiceNotes: evaluated.voiceNotes,
    signalNotes: evaluated.signalNotes,
    subscribers: about?.subscribers,
    evaluatedAt: new Date().toISOString(),
    evaluatedModel: "claude-sonnet-5",
  };
}
