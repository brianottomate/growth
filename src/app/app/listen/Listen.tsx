"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpc } from "@/orpc/client";

import { Instagram } from "./Instagram";
import { Playbook } from "./Playbook";
import { Reddit } from "./Reddit";
import { RedditScanWidget } from "./RedditScanWidget";
import { Sources } from "./Sources";
import { Tools } from "./Tools";
import { Twitter } from "./Twitter";
import { XListening } from "./XListening";

type TabId = "monitor" | "reddit" | "instagram" | "x" | "llm" | "playbook";

export function Listen({
  defaultTab,
  initialBrandId,
}: {
  defaultTab: TabId;
  initialBrandId?: string;
}) {
  const [brandId, setBrandId] = useState<string | undefined>(initialBrandId);
  const { data, isLoading, isError, error } = useQuery(
    orpc.listening.overview.queryOptions({
      input: brandId ? { brandId } : undefined,
    }),
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
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }
  if (!data?.brand) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Add an owned brand on the{" "}
        <Link href="/app/brands" className="text-foreground underline">
          Brands page
        </Link>{" "}
        to start listening.
      </div>
    );
  }

  return (
    <Tabs
      key={data.brand.id}
      value={tab}
      onValueChange={onTabChange}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Listening for</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sources and reply guidance are configured independently for each
            owned brand.
          </p>
        </div>
        <Select
          value={data.brand.id}
          onValueChange={(nextBrandId) => {
            setBrandId(nextBrandId);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("brand", nextBrandId);
              window.history.replaceState(null, "", url);
            }
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
                {brand.configured ? " · configured" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            <p className="mt-1 text-sm text-muted-foreground">
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
            <p className="mt-1 text-sm text-muted-foreground">
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
          key={data.brand.id}
          brandId={data.brand.id}
          brandName={data.brand.name}
          story={data.story}
          brandVoice={data.brandVoice}
        />
      </TabsContent>
    </Tabs>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}
