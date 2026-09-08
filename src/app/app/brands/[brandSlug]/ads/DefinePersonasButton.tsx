"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Hand persona definition to the chat: it reads the brand and proposes them. */
export function DefinePersonasButton({ brandId, brandName }: { brandId: string; brandName: string }) {
  return (
    <Button
      size="sm"
      className="rounded-full"
      onClick={() =>
        sendAssistantIntent({
          type: "define_personas",
          brandId,
          brandName,
          visibleText: `Define personas for ${brandName}: who books their homes, two or three of them, from what you can read about the brand.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Define personas
    </Button>
  );
}
