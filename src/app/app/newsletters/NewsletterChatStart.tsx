"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function NewsletterChatStart({
  brandId,
  brandName,
}: {
  brandId?: string;
  brandName?: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        sendAssistantIntent({
          type: "plan_email",
          brandId,
          brandName,
          visibleText:
            "Help me plan a newsletter issue or one-off email blast. Talk through the premise, whether it belongs to a series or pillar, and its content-calendar timing before creating an empty slot. Do not generate the full email until we select that individual slot.",
        })
      }
    >
      <MessageSquare className="size-4" /> Shape
    </Button>
  );
}
