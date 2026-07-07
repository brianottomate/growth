"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/trpc/react";

import { Instagram } from "./Instagram";
import { Playbook } from "./Playbook";
import { Reddit } from "./Reddit";
import { RedditScanWidget } from "./RedditScanWidget";
import { Sources } from "./Sources";
import { Tools } from "./Tools";
import { Twitter } from "./Twitter";
import { XListening } from "./XListening";

const TAB_IDS = [
  "monitor",
  "reddit",
  "instagram",
  "x",
  "llm",
  "playbook",
] as const;
type TabId = (typeof TAB_IDS)[number];

export function Listen({ defaultTab }: { defaultTab: TabId }) {
  const trpc = useTRPC();
  const { data, isLoading, isError, error } = useQuery(
    trpc.listening.overview.queryOptions(),
  );

  const [tab, setTab] = useState<TabId>(defaultTab);

  const onTabChange = (v: string) => {
    setTab(v as TabId);
    // Shallow URL sync so tabs are shareable without a server round-trip.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", v);
      window.history.replaceState(null, "", url);
    }
  };

  if (isLoading) return <Skeleton label="listening strategy" />;
  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        {error.message}
      </div>
    );
  }
  if (!data?.brand) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        No listening brand configured. Run{" "}
        <code className="font-mono">scripts/seed-listening-sources.ts</code>.
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
      <TabsList>
        <TabsTrigger value="monitor">What we monitor</TabsTrigger>
        <TabsTrigger value="reddit">Reddit</TabsTrigger>
        <TabsTrigger value="instagram">Instagram</TabsTrigger>
        <TabsTrigger value="x">X</TabsTrigger>
        <TabsTrigger value="llm">LLM &amp; tools</TabsTrigger>
        <TabsTrigger value="playbook">Playbook</TabsTrigger>
      </TabsList>

      <TabsContent value="monitor">
        <Sources brand={data.brand} sources={data.sources} />
      </TabsContent>

      <TabsContent value="reddit" className="space-y-10">
        <Reddit />
        {/* Live subreddit sweep (not persisted) — complements the queue above
            until on-demand scans persist into the mention store too. */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Live scan</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              On-demand AI scan over the configured subreddits — scored for
              intent, with draft replies. Results are not saved to the queue
              yet.
            </p>
          </div>
          <RedditScanWidget />
        </section>
      </TabsContent>

      <TabsContent value="instagram">
        <Instagram />
      </TabsContent>

      <TabsContent value="x" className="space-y-10">
        <Twitter />
        {/* Live watchlist sweep (localStorage only) — complements the persisted
            queue above, which the 6-hourly cron fills. */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Live scan</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              On-demand scan over the watchlist terms, straight against the X
              API. Results live in this browser only — the queue above is the
              persisted one, fed by the 6-hourly cron.
            </p>
          </div>
          <XListening />
        </section>
      </TabsContent>

      <TabsContent value="llm">
        <Tools />
      </TabsContent>

      <TabsContent value="playbook">
        <Playbook
          brandId={data.brand.id}
          story={data.story}
          brandVoice={data.brandVoice}
        />
      </TabsContent>
    </Tabs>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
      Loading {label}…
    </div>
  );
}
