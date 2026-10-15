"use client";

import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

export function NewsletterChatStart({
  brandId,
  brandName,
  series,
  setup = false,
}: {
  brandId?: string;
  brandName?: string;
  series?: { id: string; name: string };
  setup?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={setup ? "default" : "outline"}
      onClick={() =>
        sendAssistantIntent({
          type: "plan_email",
          ...(setup ? { mode: "setup_newsletter" as const } : {}),
          brandId,
          brandName,
          visibleText: setup
            ? `Set up ${brandName ?? "this brand"}’s newsletter. Read the brand story, voice, website context, homes and existing content first. Recommend a newsletter name, reader promise, structure and cadence, then create the series and draft its first two distinct editions using verified brand facts, photos and booking links. Use existing work where appropriate. Make a useful proposal rather than starting with a questionnaire. Keep both editions unscheduled and unapproved; do not send anything. Show the suggested direction and links to the drafts so we can shape them.`
            : series
              ? `Help me shape newsletter ${series.name} (series ${series.id}) and plan its next editions. Keep new email slots linked to this series. Talk through the premise and content-calendar timing before creating slots. Do not generate a full email until we select that individual edition.`
              : "Help me shape one standalone email broadcast. Read this brand's story, featured homes and existing broadcast drafts first. Use an existing draft when appropriate. Propose a premise, template, homes and CTA, then create or refine that single broadcast once we agree. Keep it unscheduled unless I give a send time. Do not create a newsletter series or sequence, or ask about series or pillars, unless I request one. Do not send anything.",
        })
      }
    >
      <MessageSquare className="size-4" />{" "}
      {setup ? "Set up your newsletter" : "Shape"}
    </Button>
  );
}
