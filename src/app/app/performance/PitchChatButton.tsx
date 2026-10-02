"use client";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function PitchChatButton({
  brandId,
  name,
  domain,
}: {
  brandId?: string;
  name: string;
  domain?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (brandId) {
          sendAssistantIntent({
            type: "work_pitch",
            newThread: true,
            brandId,
            brandName: name,
            visibleText: `Help me shape ${name}'s sales pitch. Review its saved pitch and brand information, then suggest the most useful improvements. Don't save changes yet.`,
          });
        } else if (domain) {
          sendAssistantIntent({
            type: "work_prospect",
            newThread: true,
            domain,
            companyName: name,
            visibleText: `Research ${name} (${domain}) for a sales pitch using public website and search evidence. This is an unadded lead. Suggest positioning and missing information; don't create a prospect, enrich a brand or save anything yet.`,
          });
        }
      }}
    >
      <MessageSquare className="size-3.5" />
      Open in chat
    </Button>
  );
}
