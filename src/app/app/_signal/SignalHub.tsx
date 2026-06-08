import { Suspense, type ReactNode } from "react";

import { isZernioConfigured } from "@/server/clients/zernio.client";

import { AdComments } from "../listen/AdComments";
import { Comments } from "../listen/Comments";
import { RedditScanWidget } from "../listen/RedditScanWidget";
import { TwitterScanWidget } from "../listen/TwitterScanWidget";
import { conversationReplyUrl } from "./conversation-url";
import { getRecentConversationsWithThreads } from "./inbox-data";
import { InboxClient } from "./InboxClient";
import { SignalTabs, type SignalTabId } from "./SignalTabs";
import { UnifiedQueue, type QueueConversation } from "./UnifiedQueue";

/**
 * Unified inbound surface — DMs, comments, ad comments, and social mentions on
 * one page (/app/listen). Tabs are deep-linkable via ?tab=; /app/inbox redirects
 * here. Zernio owns the conversations/comments + replying; we own triage.
 */
export function SignalHub({
  defaultTab,
  title,
  subtitle,
}: {
  defaultTab: SignalTabId;
  title: string;
  subtitle: string;
}) {
  const sections: { tab: Exclude<SignalTabId, "all">; node: ReactNode }[] = [
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
      tab: "comments",
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
    {
      tab: "mentions",
      node: (
        <Section
          title="Reddit"
          blurb="On-demand AI scan over the Tier 1 STR operator subreddits — scored for intent, with on-demand draft replies."
        >
          <RedditScanWidget />
        </Section>
      ),
    },
    {
      tab: "mentions",
      node: (
        <Section
          title="X / Twitter"
          blurb="On-demand AI scan of brand + STR pain phrases from the last 7 days, scored for intent."
        >
          <TwitterScanWidget />
        </Section>
      ),
    },
    {
      tab: "mentions",
      node: (
        <Section
          title="Keyword alerts"
          blurb="F5Bot emails when Wander terms appear on Reddit / Hacker News / Lobsters."
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
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <SignalTabs
        defaultTab={defaultTab}
        overview={
          <Suspense fallback={<Loading label="priority queue" />}>
            <QueueSection />
          </Suspense>
        }
        sections={sections}
      />
    </div>
  );
}

async function QueueSection() {
  // The DM rows need conversation context to be meaningful; Reddit/X carry their
  // own. If Zernio is down/unconfigured we still render the queue (those two
  // channels work) with no DM conversations to join against.
  let conversations: QueueConversation[] = [];
  if (isZernioConfigured) {
    try {
      const { items } = await getRecentConversationsWithThreads();
      conversations = items
        .filter((i) => typeof i.conversation.id === "string")
        .map((i) => ({
          id: i.conversation.id!,
          participantName: i.conversation.participantName,
          participantUsername: i.conversation.participantUsername,
          platform: i.conversation.platform,
          lastMessage: i.conversation.lastMessage,
          url: conversationReplyUrl(i.conversation),
        }));
    } catch {
      conversations = [];
    }
  }
  return <UnifiedQueue conversations={conversations} />;
}

async function DmsSection() {
  if (!isZernioConfigured) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
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
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
