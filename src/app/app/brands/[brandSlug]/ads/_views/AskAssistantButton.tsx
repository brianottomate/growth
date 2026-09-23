"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  sendAssistantIntent,
  type CampaignFocus,
} from "@/lib/assistant-events";

/**
 * Hand one step of the campaign to the assistant. The same intent as the
 * campaign's "Work in chat", with the step attached so the chat builds that
 * piece first and the operator iterates on what it made.
 */
export function AskAssistantButton({
  brandId,
  brandName,
  campaignId,
  campaignName,
  focus,
  ask,
  label = "Work in chat",
  variant = "outline",
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  focus: CampaignFocus;
  /** What the operator is asking for, as the chat will show it. */
  ask: string;
  label?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() =>
        sendAssistantIntent({
          type: "work_ad_campaign",
          brandId,
          brandName,
          campaignId,
          campaignName,
          focus,
          visibleText: `${ask}\n\nBrand ID: ${brandId}\nCampaign ID: ${campaignId}`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      {label}
    </Button>
  );
}
