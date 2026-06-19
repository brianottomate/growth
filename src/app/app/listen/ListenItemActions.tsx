"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Send } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/**
 * Read-only listening posture: instead of a "generate reply" composer that would
 * imply posting back through Zernio, we hand the rep the context. They copy it,
 * or open it pre-filled in Claude / ChatGPT and take it from there.
 *
 * When `mentionId` is set (persisted-mention surfaces like the Reddit room), a
 * "Test → Slack" button force-broadcasts this mention to #radio-social-listening
 * so the team can smoke-test the F5Bot→Slack plumbing on any row.
 */
export function ListenItemActions({
  context,
  mentionId,
}: {
  context: string;
  mentionId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const trpc = useTRPC();
  const testSlack = useMutation(
    trpc.mention.testSlack.mutationOptions({
      onSuccess: (res) => {
        if (res.success) toast.success(`Sent test mention to ${res.channel}`);
        else toast.error(`Slack: ${res.error}`);
      },
      onError: (err) => toast.error(`Slack test failed: ${err.message}`),
    }),
  );

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
      {mentionId && (
        <button
          type="button"
          onClick={() => testSlack.mutate({ id: mentionId })}
          disabled={testSlack.isPending}
          className={cls}
        >
          <Send className="h-3 w-3" />
          {testSlack.isPending ? "Sending…" : "Test → Slack"}
        </button>
      )}
    </div>
  );
}
