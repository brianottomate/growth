"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  sendAssistantIntent,
  type CampaignFocus,
} from "@/lib/assistant-events";

/**
 * Hand one step of the campaign to the assistant. The same intent as "Work in
 * chat", with the step attached so the chat opens on that job rather than
 * reading the whole campaign back first.
 */
export function AskAssistantButton({
  brandId,
  brandName,
  campaignId,
  campaignName,
  focus,
  ask,
  label = "Ask the assistant",
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
          visibleText: ask,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      {label}
    </Button>
  );
}
