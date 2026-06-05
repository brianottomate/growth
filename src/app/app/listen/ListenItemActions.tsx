"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { toast } from "@/components/ui/toast";

/**
 * Read-only listening posture: instead of a "generate reply" composer that would
 * imply posting back through Zernio, we hand the rep the context. They copy it,
 * or open it pre-filled in Claude / ChatGPT and take it from there.
 */
export function ListenItemActions({ context }: { context: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(context);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Context copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(context)}`;
  const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(context)}`;

  const cls =
    "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={copy} className={cls}>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "Copied" : "Copy context"}
      </button>
      <a href={claudeUrl} target="_blank" rel="noreferrer noopener" className={cls}>
        <ExternalLink className="h-3 w-3" />
        Open in Claude
      </a>
      <a href={chatgptUrl} target="_blank" rel="noreferrer noopener" className={cls}>
        <ExternalLink className="h-3 w-3" />
        Open in ChatGPT
      </a>
    </div>
  );
}
