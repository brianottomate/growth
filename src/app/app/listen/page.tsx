import type { Metadata } from "next";
import { Suspense } from "react";

import { AdComments } from "./AdComments";
import { Comments } from "./Comments";
import { RedditScanWidget } from "./RedditScanWidget";
import { TwitterScanWidget } from "./TwitterScanWidget";
import { LISTENING_WINDOW_DAYS } from "./zernio-listening";

export const metadata: Metadata = {
  title: "Listen",
};

export default function ListenPage() {
  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Listen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Public signal across channels from the last {LISTENING_WINDOW_DAYS}{" "}
          days — comments on owned posts and paid ads, plus social monitoring.
          Read-only: copy the context or open it in Claude / ChatGPT to draft a
          response. (Direct messages live in{" "}
          <span className="font-medium text-foreground">Inbox</span>.)
        </p>
      </header>

      <Section
        title="Comments"
        blurb="Comments on Wander's owned social posts (last 14 days, across all connected accounts) via Zernio."
      >
        <Suspense fallback={<Loading label="comments" />}>
          <Comments />
        </Suspense>
      </Section>

      <Section
        title="Ad comments"
        blurb='Comments on Meta ad creatives, including dark posts. High-signal market intent like "no inventory in Wisconsin".'
      >
        <Suspense fallback={<Loading label="ad comments" />}>
          <AdComments />
        </Suspense>
      </Section>

      <Section
        title="Reddit"
        blurb="On-demand AI scan over the Tier 1 STR operator subreddits — scored for intent, with on-demand draft replies."
      >
        <RedditScanWidget />
      </Section>

      <Section
        title="X / Twitter"
        blurb="On-demand AI scan of brand + STR pain phrases from the last 7 days, scored for intent."
      >
        <TwitterScanWidget />
      </Section>

      <Section
        title="Keyword alerts"
        blurb="F5Bot emails when Wander terms appear on Reddit / Hacker News / Lobsters — the backstop while the Reddit Data API approval is pending."
      >
        <a
          href="https://f5bot.com/dash"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Open F5Bot dashboard ↗
        </a>
      </Section>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}
