"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, FileText } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

/**
 * One quiet chip for a link a rep sends: the name opens it, the icon on the
 * end copies it. Two links a row used to take four controls; this is two.
 * `viewHref` adds a third segment that opens what came back, inside the app.
 */
export function SendLink({
  label,
  url,
  viewHref,
  viewLabel,
  className,
}: {
  label: string;
  url: string;
  viewHref?: string;
  viewLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className={cn(
        "inline-flex h-7 items-stretch overflow-hidden rounded-full border border-border/80 text-[11.5px] text-muted-foreground",
        className,
      )}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center pr-2 pl-3 hover:bg-muted/60 hover:text-foreground"
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
          "flex items-center border-l px-2 hover:bg-muted/60 hover:text-foreground",
          copied && "text-emerald-300",
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      {viewHref ? (
        <Link
          href={viewHref}
          aria-label={viewLabel}
          title={viewLabel}
          className="flex items-center border-l px-2 hover:bg-muted/60 hover:text-foreground"
        >
          <FileText className="size-3" />
        </Link>
      ) : null}
    </span>
  );
}
