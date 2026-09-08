"use client";

import { Check, Copy, MessageSquare } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";

/** Copy the intake link, or set the prospect up in chat. */
export function ProspectActions({
  website,
  intakeUrl,
  pitchUrl,
}: {
  website: string | null;
  intakeUrl: string | null;
  pitchUrl: string | null;
}) {
  const [copied, setCopied] = useState<"intake" | "pitch" | null>(null);
  const copy = async (which: "intake" | "pitch", url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };
  const pillClass = "h-auto rounded-full px-3 py-1 text-[11.5px] font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pitchUrl ? (
        <Button size="sm" variant="outline" className={pillClass} onClick={() => copy("pitch", pitchUrl)}>
          {copied === "pitch" ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied === "pitch" ? "Copied" : "Copy pitch link"}
        </Button>
      ) : null}
      {intakeUrl ? (
        <Button size="sm" variant="outline" className={pillClass} onClick={() => copy("intake", intakeUrl)}>
          {copied === "intake" ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied === "intake" ? "Copied" : "Copy intake link"}
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
