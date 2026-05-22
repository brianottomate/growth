import type { Metadata } from "next";

import { RedditScanWidget } from "./RedditScanWidget";
import { TwitterScanWidget } from "./TwitterScanWidget";

export const metadata: Metadata = {
  title: "Growth",
  description:
    "Wander growth experiments, monitoring, and tooling — work in progress.",
};

export default function GrowthPage() {
  return (
    <div className="bg-white px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <p className="text-sm font-medium tracking-wide text-rose-600 uppercase">
            Work in progress
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Growth
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            A living surface for Wander&apos;s growth experiments, monitoring
            stack, and open questions. Iterating fast — expect rough edges.
          </p>
        </header>

        <KeywordMonitoringSection />
        <XSection />
        <RedditSection />
        <LearningsSection />
      </div>
    </div>
  );
}

function KeywordMonitoringSection() {
  return (
    <section className="border-t border-gray-200 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
        Keyword monitoring
      </h2>
      <p className="mt-3 text-base text-gray-600">
        We listen for high-intent mentions across Reddit and Hacker News so the
        team can engage in real time — answering questions, joining threads
        about direct booking, and catching brand mentions early.
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              F5Bot
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Free keyword-alert service that emails when your terms appear on
              Reddit, Hacker News, or Lobsters. Right tool for brand monitoring
              while the Reddit Data API approval is pending.
            </p>
          </div>
          <a
            href="https://f5bot.com/dash"
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            f5bot dashboard ↗
          </a>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-900">
            Alerts we&apos;re running
          </h4>
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {ALERTS.map((alert) => (
              <li
                key={alert.term}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-gray-900">
                    {alert.term}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{alert.purpose}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {alert.flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            <span className="font-mono">whole</span> = whole-word match ·{" "}
            <span className="font-mono">only-reddit</span> = ignore HN/Lobsters
            · <span className="font-mono">no-comments</span> = posts only
          </p>
        </div>

      </div>
    </section>
  );
}

function XSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
        X / Twitter
      </h2>
      <p className="mt-3 text-base text-gray-600">
        API credentials are wired (bearer-token auth, read-only) and the smoke
        test passes. The plan mirrors Reddit: monitor mentions of Wander and
        adjacent STR conversation, route high-signal threads to the team.
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Smoke test: <code className="font-mono text-base">scripts/test-x.ts</code>
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Hits <code className="font-mono">/users/by/username/wander</code>{" "}
              and <code className="font-mono">/tweets/search/recent</code> to
              verify auth + tier access. Both endpoints return 200 — credits
              are funded and reads work.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
            unblocked
          </span>
        </div>

        <TwitterScanWidget />
      </div>
    </section>
  );
}

function RedditSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
        Reddit monitoring
      </h2>
      <p className="mt-3 text-base text-gray-600">
        An hourly Vercel cron polls the Tier 1 STR-operator subreddits, filters
        new posts against a keyword list, and logs hits to Vercel logs. No
        persistence yet — review by tailing logs; layer AI scoring + Slack
        notifications later once we see what kind of signal lands.
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Cron: <code className="font-mono text-base">/api/cron/reddit</code>
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Runs hourly. Logs go to Vercel runtime logs — filter by{" "}
              <code className="font-mono">requestPath:/api/cron/reddit</code>.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            v1 · log-only
          </span>
        </div>

        <RedditScanWidget />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Subreddits polled
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {SUBREDDITS.map((sub) => (
                <li key={sub}>
                  <a
                    href={`https://reddit.com/r/${sub}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono hover:text-rose-600"
                  >
                    r/{sub}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Match tags
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              <li>
                <span className="font-mono text-xs">brand</span> — direct
                Wander/WanderOS references
              </li>
              <li>
                <span className="font-mono text-xs">high-intent</span> — pain
                phrases primed for sales
              </li>
              <li>
                <span className="font-mono text-xs">medium-intent</span> —
                operator-evaluating-tools signals
              </li>
              <li>
                <span className="font-mono text-xs">positioning</span> — direct
                booking discussion
              </li>
            </ul>
          </div>
        </div>

        <details className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            Why log-only for v1?
          </summary>
          <p className="mt-3 text-sm text-gray-600">
            Faster to validate signal volume. Once we know how often genuine
            matches land, we&apos;ll decide whether to (a) write to Neon for a
            browsable inbox, (b) score with an LLM, and (c) post to Slack.
            Building all of that before knowing the signal is over-engineering.
          </p>
        </details>
      </div>
    </section>
  );
}

function LearningsSection() {
  return (
    <section className="mt-16 border-t border-gray-200 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
        Learnings
      </h2>
      <p className="mt-3 text-base text-gray-600">
        Notes from the session that built this page. Will grow as we iterate.
      </p>

      <div className="mt-8 space-y-4">
        {LEARNINGS.map((l) => (
          <article
            key={l.title}
            className="rounded-2xl border border-gray-200 bg-white p-6"
          >
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  l.kind === "finding"
                    ? "bg-blue-100 text-blue-900"
                    : l.kind === "blocker"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {l.kind}
              </span>
              <h3 className="text-base font-semibold text-gray-900">
                {l.title}
              </h3>
              <span className="ml-auto text-xs text-gray-500">{l.date}</span>
            </div>
            <p className="mt-3 text-sm text-gray-600">{l.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type Learning = {
  date: string;
  kind: "finding" | "blocker" | "decision";
  title: string;
  body: string;
};

const LEARNINGS: Learning[] = [
  {
    date: "2026-05-21",
    kind: "finding",
    title:
      "Keyword filter is high-precision, low-recall — best opportunities slip through",
    body: "Running the keyword matcher against a fresh pull of all 4 Tier 1 subs, the two highest-value posts (r/PropertyManagement asking 'How are you all handling bookings across different platforms?' and r/AirbnbHosts venting about the new guest-phone-number masking) both scored zero matches. They didn't contain any of our 12 phrases. Implication: AI scoring shouldn't be gated behind keyword match — run it on every post and let the model decide. At ~100 posts/day across these subs, Haiku scoring costs cents per month.",
  },
  {
    date: "2026-05-21",
    kind: "finding",
    title: "r/PropertyManagement is ~60% noise for our use case",
    body: "Half the posts are about long-term tenant placement, multifamily, and tenant disputes — irrelevant to WanderOS. Worth pre-filtering for STR context (mentions of 'airbnb', 'vrbo', 'short term', 'STR', 'vacation rental', 'guest', 'host') before AI scoring kicks in.",
  },
  {
    date: "2026-05-21",
    kind: "finding",
    title: "r/VRBOHosts has very low post volume — daily polling is fine",
    body: "First fetch returned 25 posts spanning 8 days. Hourly polling on this sub is overkill; the cron will mostly see no new content. Can drop it to daily or batch with others.",
  },
  {
    date: "2026-05-21",
    kind: "finding",
    title: "X API unblocked — credits funded, reads working end-to-end",
    body: "After topping up the developer account, both /users/by/username and /tweets/search/recent return 200. Bearer-token auth is fine, no further setup needed. Lesson: monitor credit balance going forward, because zero credits returns 402 on every call (including cheap reads), and the monitor would silently go dark.",
  },
  {
    date: "2026-05-21",
    kind: "blocker",
    title: "Reddit Data API approval is a manual-ticket process",
    body: "Reddit's /prefs/apps create-app flow is now gated behind a help-desk ticket — days-to-weeks SLA. Devvit (developers.reddit.com) is a parallel product that does NOT unblock the Data API. Workaround: unauthenticated JSON listings work fine at our volume (4 subs/hour, well under the 10 req/min per-User-Agent limit). RSS is a backup if JSON access tightens.",
  },
  {
    date: "2026-05-21",
    kind: "decision",
    title: "Log-only Reddit cron in v1, layer AI + Slack after we see signal",
    body: "Instead of building Neon persistence, LLM scoring, and Slack posting up front, we ship a log-only cron and review hits in Vercel logs for a week. This validates signal volume and quality before we commit to a data model or notification UX.",
  },
  {
    date: "2026-05-21",
    kind: "finding",
    title: "AI scoring outperforms keyword filter — confirmed against live data",
    body: "Claude Sonnet 4.6 (via the AI SDK with a Zod schema) scored 100 fresh posts in under a minute for cents per run and surfaced things keywords missed: notably a 10/10 critical brand mention on r/vrbohosts ('My Experience with Wander.com — A Warning for Hosts and Property Managers') and a 9/10 high-intent rant about Airbnb's new guest-phone masking. It also correctly classified ambiguous-language posts (e.g. 'How are you all handling bookings…') as monitor/skip rather than over-scoring them. Drafting uses Opus 4.7 — pricier, but the marketing plan's disclosure + no-pitch-first rules really benefit from the smarter model.",
  },
];

const SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
];

type Alert = {
  term: string;
  purpose: string;
  flags: string[];
};

const ALERTS: Alert[] = [
  {
    term: "wander.com",
    purpose: "URL mentions — direct brand signal.",
    flags: [],
  },
  {
    term: "Wander Sites",
    purpose: "Discussion of the Wander Sites product.",
    flags: ["whole", "only-reddit"],
  },
  {
    term: "Wander Operated",
    purpose: "Discussion of the full-management arm.",
    flags: ["whole", "only-reddit"],
  },
  {
    term: "direct booking site",
    purpose:
      "WanderOS positioning — natural insertion point for the marketing team.",
    flags: ["whole", "only-reddit"],
  },
  {
    term: "Airbnb alternatives",
    purpose: "Top-of-funnel — operators evaluating their options.",
    flags: ["whole", "only-reddit", "no-comments"],
  },
  {
    term: "fire my property manager",
    purpose: "High-intent pain moment — primed for Wander Operated.",
    flags: ["whole", "only-reddit"],
  },
];
