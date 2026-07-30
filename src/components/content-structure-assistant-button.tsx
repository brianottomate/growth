"use client";

import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function ContentStructureAssistantButton({
  brandId,
  brandName,
  source,
  seriesName,
  size = "sm",
}: {
  brandId: string;
  brandName: string;
  source: "brand" | "content" | "pillars" | "series";
  seriesName?: string;
  size?: "sm" | "default";
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() =>
        sendAssistantIntent({
          type: "shape_content_structure",
          brandId,
          brandName,
          source,
          visibleText: seriesName
            ? `Help me map the first posts for the “${seriesName}” series`
            : `Help me shape ${brandName}’s content pillars and series`,
        })
      }
    >
      <Layers className="size-3.5" />
      {seriesName ? "Plan first posts" : "Shape content structure"}
    </Button>
  );
}
