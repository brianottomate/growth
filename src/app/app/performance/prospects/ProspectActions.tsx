"use client";

import { Check, Copy, MessageSquare } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Copy the intake link, or set the prospect up in chat. */
export function ProspectActions({
  website,
  intakeUrl,
}: {
  website: string | null;
  intakeUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const pillClass = "h-auto rounded-full px-3 py-1 text-[11.5px] font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {intakeUrl ? (
        <Button
          size="sm"
          variant="outline"
          className={pillClass}
          onClick={async () => {
            await navigator.clipboard.writeText(intakeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy intake link"}
        </Button>
      ) : null}
      {website ? (
        <Button
          size="sm"
          variant="outline"
          className={pillClass}
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
