"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Copies a link to one item on a page: this URL with its `#anchor` (filters
 * and tabs kept), or an explicit `href` when the item has a URL of its own.
 */
export function CopyAnchorLink({
  anchor,
  href,
  label,
  size = "sm",
  className,
}: {
  anchor?: string;
  href?: string;
  label: string;
  size?: "sm" | "icon-sm";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant={size === "icon-sm" ? "ghost" : "outline"}
      className={className}
      aria-label={copied ? "Link copied" : label}
      title={copied ? "Link copied" : label}
      onClick={async () => {
        const { origin, pathname, search } = window.location;
        const link = href
          ? new URL(href, origin).toString()
          : `${origin}${pathname}${search}#${anchor}`;
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          toast.error("Could not copy the link");
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Link2 aria-hidden="true" className="size-3.5" />
      )}
    </Button>
  );
}
