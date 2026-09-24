"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Hand a whole set of creative to the chat: it reviews it, then fixes what it finds. */
export function ReviewInChatButton({
  brandId,
  brandName,
  surface,
  campaignId,
}: {
  brandId: string;
  brandName: string;
  surface: "catalog" | "ads";
  campaignId?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={() =>
        sendAssistantIntent({
          type: "review_portfolio",
          brandId,
          brandName,
          surface,
          ...(campaignId ? { campaignId } : {}),
          visibleText: `Review ${brandName}'s ${surface === "catalog" ? "catalog" : "ads"} as a set and fix what stands out.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Review in chat
    </Button>
  );
}
