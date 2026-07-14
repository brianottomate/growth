"use client";

import { MessageSquarePlus } from "lucide-react";

import { sendAssistantIntent } from "@/lib/assistant-events";

export function NewsletterChatStart({
  brandId,
  brandName,
}: {
  brandId?: string;
  brandName?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        sendAssistantIntent({
          type: "plan_email",
          brandId,
          brandName,
          visibleText:
            "Help me plan a newsletter issue or one-off email blast. Talk through the premise, whether it belongs to a series or pillar, and its content-calendar timing before creating an empty slot. Do not generate the full email until we select that individual slot.",
        })
      }
      className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
    >
      <MessageSquarePlus className="size-4" /> Plan an email in chat
    </button>
  );
}
