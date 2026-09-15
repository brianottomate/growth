"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Set the prospect up in chat; the links live in the row menu. */
export function ProspectActions({ website }: { website: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {website ? (
        <Button
          size="sm"
          variant="outline"
          shape="round"
          density="editorial"
          weight="semibold"
          onClick={() =>
            sendAssistantIntent({
              type: "set_up_client",
              website,
              visibleText: `Set up ${website.replace(/^https?:\/\//, "")}: mark, photos, a campaign shell and first ads from their homes. Stop before pushing.`,
            })
          }
        >
          <MessageSquare className="size-3" />
          Set up in chat
        </Button>
      ) : null}
    </div>
  );
}
