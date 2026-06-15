"use client";

import type { ReactNode } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifecycleStrategy } from "./LifecycleStrategy";

const TAB_VALUES = ["strategy", "mirror"] as const;

export function LifecycleTabs({
  brands,
  mirror,
  mirrorCount,
}: {
  brands: { id: string; name: string }[];
  mirror: ReactNode;
  mirrorCount: number;
}) {
  // Persist the active tab in ?tab= so it survives reload / is shareable.
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES).withDefault("strategy"),
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => void setTab(v as (typeof TAB_VALUES)[number])}
      className="mt-5"
    >
      <TabsList>
        <TabsTrigger value="strategy">Strategy</TabsTrigger>
        <TabsTrigger value="mirror">Mirror · {mirrorCount}</TabsTrigger>
      </TabsList>
      <TabsContent value="strategy">
        <LifecycleStrategy brands={brands} />
      </TabsContent>
      <TabsContent value="mirror">{mirror}</TabsContent>
    </Tabs>
  );
}
