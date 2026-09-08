"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Hand a client's first campaign to the chat: shell, ads from their homes, then the page. */
export function StartCampaignInChat({ brandId, brandName }: { brandId: string; brandName: string }) {
  return (
    <Button
      size="sm"
      className="h-7 rounded-full px-3 text-[11.5px]"
      onClick={() =>
        sendAssistantIntent({
          type: "start_client_campaign",
          brandId,
          brandName,
          visibleText: `Start ${brandName}'s first campaign: read their intake, open the campaign shell, draft ads from their homes, then take me to it.`,
        })
      }
    >
      <MessageSquare className="size-3" />
      Start campaign in chat
    </Button>
  );
}
