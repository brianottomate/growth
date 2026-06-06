"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifecycleStrategy } from "./LifecycleStrategy";

export function LifecycleTabs({
  brands,
  mirror,
  mirrorCount,
}: {
  brands: { id: string; name: string }[];
  mirror: ReactNode;
  mirrorCount: number;
}) {
  return (
    <Tabs defaultValue="strategy" className="mt-5">
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
