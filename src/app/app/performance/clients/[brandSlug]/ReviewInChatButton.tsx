"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

type ReviewTarget = {
  brandId: string;
  brandName: string;
  surface: "catalog" | "ads";
  campaignId?: string;
};

/** Hand a whole set of creative to the chat: it reviews it, then fixes what it finds. */
export function reviewInChat({
  brandId,
  brandName,
  surface,
  campaignId,
}: ReviewTarget) {
  sendAssistantIntent({
    type: "review_portfolio",
    brandId,
    brandName,
    surface,
    ...(campaignId ? { campaignId } : {}),
    visibleText: `Review ${brandName}'s ${surface === "catalog" ? "catalog" : "ads"} as a set and fix what stands out.`,
  });
}

export function ReviewInChatButton(target: ReviewTarget) {
  return (
    <Button variant="outline" onClick={() => reviewInChat(target)}>
      <MessageSquare className="size-3.5" />
      Review in chat
    </Button>
  );
}
