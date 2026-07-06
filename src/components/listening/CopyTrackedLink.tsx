"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  buildTrackedLink,
  DEFAULT_TRACKED_DESTINATION,
  TRACKED_LINK_DESTINATIONS,
  type TrackedLinkDestinationId,
  type TrackedLinkInput,
} from "@/lib/tracked-link";

/**
 * Show + copy a UTM-tagged wander.com link for a mention.
 *
 * Deliberately decoupled from the reply draft: the link is a pure function of
 * the mention (see buildTrackedLink), so it's one click away the instant a
 * mention shows up. Drop it in your reply when a link genuinely fits the
 * conversation; ignore it when it doesn't. Because utm_content = the mention id,
 * any signup it drives is attributed straight back to this row in Amplitude.
 */
export function CopyTrackedLink({ mention }: { mention: TrackedLinkInput }) {
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<TrackedLinkDestinationId | "custom">(
    DEFAULT_TRACKED_DESTINATION,
  );
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);

  const link = buildTrackedLink(mention, dest === "custom" ? custom : dest);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Tracked link copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const btn =
    "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        <Link2 className="h-3 w-3" />
        Tracked link
      </button>
    );
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-2 py-0.5 text-[11px] transition",
      active
        ? "border-primary/50 bg-primary/10 text-foreground"
        : "border-border/60 text-muted-foreground hover:bg-accent/40",
    );

  const options = [
    ...TRACKED_LINK_DESTINATIONS,
    { id: "custom" as const, label: "Custom" },
  ];

  return (
    <div className="bg-background/40 mt-1 flex w-full flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link2 className="text-muted-foreground h-3 w-3" />
        <span className="text-muted-foreground text-[11px] font-medium">
          Tracked link
        </span>
        {options.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDest(d.id)}
            className={pill(dest === d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {dest === "custom" && (
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="wander.com path or URL — e.g. /sites or https://www.wander.com/blog/…"
          className="bg-background w-full rounded-md border px-2 py-1 text-xs"
        />
      )}

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="bg-background text-muted-foreground w-full rounded-md border px-2 py-1 font-mono text-[11px]"
        />
        <button type="button" onClick={copy} className={btn}>
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="text-muted-foreground/70 text-[11px] leading-relaxed">
        Carries UTM tags so any signup from your reply is attributed to this
        mention in Amplitude. Only drop a link when it genuinely fits the
        conversation — and always disclose you&apos;re with Wander.
      </p>
    </div>
  );
}
