"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

/** A link a rep sends (intake form, pitch page): copy it, or open it to check. */
export function IntakeLink({ url, label = "Copy intake link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto rounded-full px-3 py-1.5 text-xs font-semibold"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : label}
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open: ${label.replace(/^Copy /, "")}`}
        className="text-muted-foreground hover:text-foreground rounded-md p-1"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </span>
  );
}
