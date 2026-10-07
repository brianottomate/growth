"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function ShapeBrandButton({
  brandId,
  brandName,
  section,
  resource,
}: {
  brandId: string;
  brandName: string;
  section: string;
  resource?: { id: string; name: string };
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
          visibleText: `Help me shape the ${section} for ${brandName} (brand ID: ${brandId}).${resource ? ` Resource: ${resource.name} (ID: ${resource.id}).` : ""} Read the current resource and relevant brand evidence. Help me make the changes I ask for; pass my direction as steer when using a generation tool. Preserve unrelated content.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Shape
    </Button>
  );
}
