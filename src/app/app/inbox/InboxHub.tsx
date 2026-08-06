import { Suspense, type ReactNode } from "react";

import { isZernioConfigured } from "@/server/clients/zernio.client";

import { AdComments } from "./AdComments";
import { Comments } from "./Comments";
import { getRecentConversationsWithThreads } from "./inbox-data";
import { InboxClient } from "./InboxClient";
import { InboxTabs, type InboxTabId } from "./InboxTabs";

/**
 * Owned-inbound surface — people talking TO us on our own surfaces: DMs,
 * comments on owned posts, and comments on ad creatives (/app/inbox). External
 * listening (Reddit / X / Instagram / F5Bot) lives on /app/listen. Zernio owns
 * the conversations/comments + replying; we own triage.
 */
export function InboxHub({ defaultTab }: { defaultTab: InboxTabId }) {
  const sections: {
    tab: Exclude<InboxTabId, "all">;
    node: ReactNode;
  }[] = [
    {
      tab: "dms",
      node: (
        <Section
          title="Direct messages"
          blurb="DMs across connected accounts. Triage on-demand, copy a thread to Claude / ChatGPT, or reply natively."
        >
          <Suspense fallback={<Loading label="conversations" />}>
            <DmsSection />
          </Suspense>
        </Section>
      ),
    },
    {
      tab: "comments",
      node: (
        <Section
          title="Comments"
          blurb="Comments on Wander's owned posts (last 14 days). Expand a post to read the thread; your own replies are flagged."
        >
          <Suspense fallback={<Loading label="comments" />}>
            <Comments />
          </Suspense>
        </Section>
      ),
    },
    {
      tab: "ads",
      node: (
        <Section
          title="Ad comments"
          blurb='Comments on Meta ad creatives. High-signal market intent like "no inventory in Wisconsin".'
        >
          <Suspense fallback={<Loading label="ad comments" />}>
            <AdComments />
          </Suspense>
        </Section>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Everything inbound on our own surfaces — DMs and comments on owned
          posts and ads. Triage on-demand, copy context to Claude / ChatGPT, or
          reply natively.
        </p>
      </header>
      <InboxTabs defaultTab={defaultTab} sections={sections} />
    </div>
  );
}

async function DmsSection() {
  if (!isZernioConfigured) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        Zernio isn&apos;t configured (no{" "}
        <code className="font-mono">ZERNIO_API_KEY</code>).
      </div>
    );
  }
  try {
    const { items } = await getRecentConversationsWithThreads();
    return <InboxClient initialItems={items} />;
  } catch (error) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        <p className="font-semibold">Failed to load conversations</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
      Loading {label}…
    </div>
  );
}
