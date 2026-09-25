"use client";

import { MessageSquare } from "lucide-react";

import { sendAssistantIntent } from "@/lib/assistant-events";

/** One client's tracker row, handed to a fresh chat to change. */
export function TrackerChatButton({
  brandId,
  brandName,
  row,
}: {
  brandId: string;
  brandName: string;
  row: Record<string, string | number | null>;
}) {
  return (
    <button
      type="button"
      aria-label={`Work on ${brandName}'s row in chat`}
      title="Work in chat"
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() =>
        sendAssistantIntent({
          type: "work_tracker_row",
          newThread: true,
          brandId,
          brandName,
          row,
          visibleText: `Update ${brandName} in the tracker.`,
        })
      }
    >
      <MessageSquare aria-hidden="true" className="size-3" />
      Chat
    </button>
  );
}
