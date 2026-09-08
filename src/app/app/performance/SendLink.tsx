"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

/**
 * One quiet chip for a link a rep sends: the name opens it, the icon on the
 * end copies it. Two links a row used to take four controls; this is two.
 */
export function SendLink({ label, url, className }: { label: string; url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className={cn(
        "border-border/80 text-muted-foreground inline-flex h-7 items-stretch overflow-hidden rounded-full border text-[11.5px]",
        className,
      )}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground hover:bg-muted/60 flex items-center pr-2 pl-3"
        title={`Open ${label.toLowerCase()}`}
      >
        {label}
      </a>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copy ${label.toLowerCase()} link`}
        title={copied ? "Copied" : "Copy link"}
        className={cn(
          "hover:text-foreground hover:bg-muted/60 flex items-center border-l px-2",
          copied && "text-emerald-300",
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}
