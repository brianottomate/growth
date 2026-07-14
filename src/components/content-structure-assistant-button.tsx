"use client";

import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function ContentStructureAssistantButton({
  brandId,
  brandName,
  source,
  size = "sm",
}: {
  brandId: string;
  brandName: string;
  source: "brand" | "content" | "pillars";
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
          visibleText: `Help me shape ${brandName}’s content pillars and series`,
        })
      }
    >
      <Layers className="size-3.5" />
      Shape content structure
    </Button>
  );
}
