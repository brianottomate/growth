"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { adaptHomesPrompt } from "@/lib/adapt-homes-prompt";

const ADAPT_URL = "https://app.adapt.com";

/**
 * The issue before it has homes: the question to ask Adapt for them, built
 * from the issue itself. Adapt's reply, pasted into this issue's chat,
 * becomes its homes and stay dates.
 */
export function FindHomesCard({
  title,
  hook,
  purpose,
  sendDate,
}: {
  title: string;
  hook?: string | null;
  purpose?: string | null;
  sendDate?: Date | string | null;
}) {
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(
    () =>
      adaptHomesPrompt({
        title,
        hook,
        purpose,
        sendDate,
      }),
    [title, hook, purpose, sendDate],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Find homes</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy prompt"}
          </button>
          <a
            href={ADAPT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Open Adapt
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
        {prompt}
      </pre>

      <p className="mt-2 text-xs text-muted-foreground">
        Paste Adapt&apos;s reply into this issue&apos;s chat.
      </p>
    </section>
  );
}
