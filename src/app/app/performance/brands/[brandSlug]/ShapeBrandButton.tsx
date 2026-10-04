"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function ShapeBrandButton({
  brandId,
  brandName,
  section,
}: {
  brandId: string;
  brandName: string;
  section: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        sendAssistantIntent({
          type: "work_performance_client",
          newThread: true,
          brandId,
          brandName,
          visibleText: `Help me shape the ${section} for ${brandName}. Read the current ${section} and the brand’s relevant evidence, then discuss the direction with me before saving changes.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Shape
    </Button>
  );
}
