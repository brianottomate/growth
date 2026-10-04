"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/**
 * Hand this campaign to the assistant. The page is deliberately read-only —
 * the dialogs cover the basics and everything else (copy, headlines, another
 * ad, a second audience) is faster to say than to fill in.
 */
export function WorkInChatButton({
  brandId,
  brandName,
  campaignId,
  campaignName,
  hasAds,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  hasAds: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        sendAssistantIntent({
          type: "work_ad_campaign",
          newThread: true,
          brandId,
          brandName,
          campaignId,
          campaignName,
          visibleText: hasAds
            ? `Help me shape “${campaignName}”. Read the current campaign and discuss what I want to refine before making changes.`
            : `Help me shape “${campaignName}”. Read the brand and campaign, then discuss the creative, audience and platforms before creating anything.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Shape
    </Button>
  );
}
