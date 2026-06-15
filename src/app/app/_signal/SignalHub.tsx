import { Suspense, type ReactNode } from "react";

import { isZernioConfigured } from "@/server/clients/zernio.client";

import { AdComments } from "../listen/AdComments";
import { Comments } from "../listen/Comments";
import { MentionsFeed } from "../listen/MentionsFeed";
import { RedditScanWidget } from "../listen/RedditScanWidget";
import { XListening } from "../listen/XListening";
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
  const sections: {
    tab: Exclude<SignalTabId, "all">;
    node: ReactNode;
    exclusive?: boolean;
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
      // X gets its own room — watchlist-driven scan, term highlighting,
      // velocity, and the 270-char composer. Kept out of the "All" overview.
      tab: "x",
      exclusive: true,
      node: <XListening />,
    },
    {
      tab: "mentions",
      node: (
        <Section
          title="Keyword mentions"
          blurb="F5Bot alerts (Reddit / Hacker News / Lobsters), forwarded via Resend, AI-extracted and scored. Mark engaged or skip — status is saved."
        >
          <MentionsFeed />
          <a
            href="https://f5bot.com/dash"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            Manage keywords in F5Bot ↗
          </a>
        </Section>
      ),
    },
    {
      tab: "mentions",
      node: (
        <Section
          title="Listening tools"
          blurb="External SoMe listening services to evaluate or integrate. Social monitoring + LLM brand visibility."
        >
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Social listening
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToolCard
                name="Mentionkit"
                href="https://mentionkit.com/pricing"
                description="AI-first. 7 platforms (Reddit, X, LinkedIn, TikTok, Bluesky, YouTube, HN). AI scoring, comment drafts, MCP server, API/webhooks. Auto-keywords from landing page."
                tag="14-day trial"
              />
              <ToolCard
                name="Buska"
                href="https://www.buska.io/pricing"
                description="Broadest coverage: 16–33+ sources incl. Pinterest, Telegram, WhatsApp. AI Reply Studio, ICP profiles. API-only pricing available ($50/1K credits)."
                tag="from $49/mo"
              />
              <ToolCard
                name="Syften"
                href="https://syften.com"
                description="Reddit/HN focused. Boolean filters, Slack-first, <1 min delivery. Solid but basic — no AI scoring or drafts."
                tag="from $20/mo"
                dimmed
              />
              <ToolCard
                name="Alertmouse"
                href="https://alertmouse.com"
                description='By Rand Fishkin (Moz/SparkToro). "What Google Alerts should be" — social + web, better filtering.'
                tag="$10/mo"
              />
              <ToolCard
                name="Octolens"
                href="https://octolens.com"
                description="Only credible LinkedIn keyword monitoring with API/webhook/MCP. Pricey but fills a real gap."
                tag="$119/mo"
              />
              <ToolCard
                name="F5Bot"
                href="https://f5bot.com"
                description="Free Reddit/HN/Lobsters alerts. Already integrated above. Pipe via Resend inbound webhook for real-time processing."
                tag="free ✓"
              />
            </div>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              LLM / AI search visibility
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToolCard
                name="Peec.ai"
                href="https://peec.ai/pricing"
                description="Track brand visibility in ChatGPT, Perplexity, Gemini, AI Overviews, Copilot. 2000+ marketing teams. MCP + API."
                tag="evaluate"
              />
            </div>
          </div>
        </Section>
      ),
    },
    {
      // LLM / AI Search listening — track how Wander appears in ChatGPT,
      // Perplexity, Gemini, AI Overviews, etc. Separate from social listening
      // because the surface is AI model outputs, not human conversations.
      //
      // Candidate tools:
      //   - Peec.ai   — AI Search Analytics (ChatGPT, Perplexity, Gemini, AI Overviews, Copilot)
      //                 2000+ marketing teams, MCP integration, API access
      //                 https://peec.ai/pricing
      //
      // Social listening tools (for the mentions/x tabs, not here):
      //   - Mentionkit — AI-first, 7 platforms (Reddit, X, LinkedIn, TikTok, Bluesky, YouTube, HN)
      //                  AI relevance scoring, comment drafting, MCP server, API/webhooks
      //                  https://mentionkit.com/pricing
      //   - Buska      — Broadest coverage (16-33+ sources incl. Pinterest, Telegram, WhatsApp)
      //                  AI Reply Studio, ICP profiles, API-only pricing available
      //                  Starter $49/mo, Growth $99/mo, Scale $249/mo
      //                  https://www.buska.io/pricing
      //   - Syften     — Reddit/HN focused, boolean filters, Slack-first, $40/mo Standard
      //   - F5Bot      — Free Reddit/HN safety net (already integrated above)
      //   - Alertmouse — Rand Fishkin, $10/mo, web/news/social
      //   - Octolens   — LinkedIn keyword monitoring, $119/mo, API/webhook/MCP
      tab: "llm",
      exclusive: true,
      node: (
        <Section
          title="LLM listening"
          blurb="Track how Wander appears in AI search results — ChatGPT, Perplexity, Gemini, AI Overviews. Coming soon."
        >
          <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            <p className="font-medium">🤖 AI Search visibility tracking</p>
            <p className="mt-2">
              Monitor how AI models mention and recommend Wander in their responses.
            </p>
            <div className="mt-4 inline-flex gap-2">
              <ToolLink href="https://peec.ai/pricing" label="Peec.ai" tag="AI Search Analytics" />
            </div>
          </div>
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

function ToolCard({
  name,
  href,
  description,
  tag,
  dimmed,
}: {
  name: string;
  href: string;
  description: string;
  tag: string;
  dimmed?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`group rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground group-hover:underline">
          {name} ↗
        </span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tag}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </a>
  );
}

function ToolLink({
  href,
  label,
  tag,
}: {
  href: string;
  label: string;
  tag: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      {label}
      <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {tag}
      </span>
      ↗
    </a>
  );
}
