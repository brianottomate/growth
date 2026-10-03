"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function PerformanceNote({
  text,
  editedBy,
  editedAt,
}: {
  text?: string | null;
  editedBy?: { name: string | null; image: string | null } | null;
  editedAt?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useEffect(() => setExpanded(false), [text]);
  useEffect(() => {
    if (expanded || !paragraph.current) return;
    const element = paragraph.current;
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  if (!text?.trim()) return null;
  const name = editedBy?.name || "Editor not recorded";
  const initials =
    editedBy?.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("") || "?";
  return (
    <section className="mt-3 space-y-2 border-t pt-3" aria-label="Client note">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">Note</h4>
        <div
          className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground"
          title={editedAt ? `Last edited by ${name} · ${editedAt}` : name}
        >
          <Avatar className="size-5">
            {editedBy?.image && <AvatarImage src={editedBy.image} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="truncate">{name}</span>
        </div>
      </div>
      <p
        ref={paragraph}
        className={`text-xs leading-5 break-words whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <Button
          variant="link"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </section>
  );
}
