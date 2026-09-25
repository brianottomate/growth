"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Walk one intake to applied in a fresh chat, so it never lands mid-thread. */
export function ReviewIntakeInChat({
  brandId,
  brandName,
  intakeId,
}: {
  brandId: string;
  brandName: string;
  intakeId: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        sendAssistantIntent({
          type: "review_intake",
          newThread: true,
          brandId,
          brandName,
          intakeId,
          visibleText: `Review ${brandName}'s intake submission and apply it.`,
        })
      }
    >
      <MessageSquare className="size-3.5" />
      Review and apply
    </Button>
  );
}
