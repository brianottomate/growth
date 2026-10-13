"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ctaLabel } from "@/components/social-mock";

/** The ad's primary text, clamped to three lines with a Show more toggle. */
export function PrimaryTextPreview({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [body, expanded]);
  return (
    <div className="max-w-2xl space-y-1 text-sm">
      <p
        ref={ref}
        id={id}
        className={`whitespace-pre-wrap text-muted-foreground ${expanded ? "" : "line-clamp-3"}`}
      >
        {body || "Primary text not set"}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="text-xs underline underline-offset-4 hover:text-muted-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** The call-to-action button label and where it goes. */
export function AdDestinationPreview({
  linkUrl,
  callToAction,
}: {
  linkUrl?: string | null;
  callToAction?: string | null;
}) {
  const destination = (() => {
    try {
      const url = new URL(linkUrl ?? "");
      return ["https:", "http:"].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  })();
  const cta = callToAction ? ctaLabel(callToAction) : null;
  return (
    <div className="flex max-w-2xl min-w-0 items-center gap-3 text-xs">
      {cta && <Badge variant="secondary">{cta}</Badge>}
      {destination ? (
        <a
          href={destination.href}
          target="_blank"
          rel="noopener noreferrer"
          title={destination.href}
          className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">
            {destination.hostname.replace(/^www\./, "")}
            {destination.pathname === "/" ? "" : destination.pathname}
          </span>
          <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : (
        <span className="text-muted-foreground">Destination not set</span>
      )}
    </div>
  );
}
