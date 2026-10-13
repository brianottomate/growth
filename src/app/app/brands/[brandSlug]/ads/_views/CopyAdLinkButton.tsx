"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Copies this page's URL with the ad's `#ad-<id>` anchor, keeping the current filters. */
export function CopyAdLinkButton({ adId }: { adId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={copied ? "Link copied" : "Copy link to this ad"}
      title={copied ? "Link copied" : "Copy link to this ad"}
      onClick={async () => {
        const { origin, pathname, search } = window.location;
        try {
          await navigator.clipboard.writeText(
            `${origin}${pathname}${search}#ad-${adId}`,
          );
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
