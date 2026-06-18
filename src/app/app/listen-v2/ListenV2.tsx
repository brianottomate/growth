"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/trpc/react";

import { XListening } from "@/app/app/listen/XListening";

import { Playbook } from "./Playbook";
import { Reddit } from "./Reddit";
import { Sources } from "./Sources";

const TAB_IDS = ["monitor", "reddit", "x", "playbook"] as const;
type TabId = (typeof TAB_IDS)[number];

export function ListenV2({ defaultTab }: { defaultTab: TabId }) {
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
        <TabsTrigger value="x">X</TabsTrigger>
        <TabsTrigger value="playbook">Playbook</TabsTrigger>
      </TabsList>

      <TabsContent value="monitor">
        <Sources brand={data.brand} sources={data.sources} />
      </TabsContent>

      <TabsContent value="reddit">
        <Reddit />
      </TabsContent>

      <TabsContent value="x">
        <XListening />
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
