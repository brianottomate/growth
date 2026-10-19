"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, ArrowUpRight } from "lucide-react";
import { SimpleDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SequenceEmailPreview } from "./sequences/SequenceEmailPreview";

type Edition = {
  id: string;
  title: string;
  status: string;
  plannedAt: string | null;
};
export function NewsletterSeriesPreview({
  name,
  editions,
}: {
  name: string;
  editions: Edition[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(editions[0]?.id);
  const index = Math.max(
    0,
    editions.findIndex((item) => item.id === selectedId),
  );
  const selected = editions[index];
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!editions.length}
        onClick={() => setOpen(true)}
      >
        <Eye className="size-4" />
        Preview newsletter
      </Button>
      <SimpleDialog
        open={open}
        onOpenChange={setOpen}
        title={name}
        description="Read each edition as an email. Calendar dates, creative approval, and delivery stay separate."
        size="xl"
        scrollable
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Edition {index + 1} of {editions.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous edition"
                  disabled={index === 0}
                  onClick={() => setSelectedId(editions[index - 1]!.id)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next edition"
                  disabled={index === editions.length - 1}
                  onClick={() => setSelectedId(editions[index + 1]!.id)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <div
              role="group"
              aria-label="Newsletter editions"
              className="flex gap-2 overflow-x-auto pb-2"
            >
              {editions.map((edition, i) => (
                <button
                  key={edition.id}
                  type="button"
                  aria-pressed={edition.id === selected.id}
                  onClick={() => setSelectedId(edition.id)}
                  className="w-52 shrink-0 space-y-2 rounded-lg border p-3 text-left aria-pressed:border-foreground aria-pressed:bg-muted"
                >
                  <span className="block text-xs text-muted-foreground">
                    Edition {i + 1} · {edition.status.replace(/_/g, " ")}
                  </span>
                  <span className="line-clamp-2 block text-sm font-medium">
                    {edition.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {edition.plannedAt
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(edition.plannedAt)) + " · planned"
                      : "No calendar date"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">{selected.title}</h3>
              <Link
                href={`/app/newsletters/${selected.id}`}
                className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Open email editor
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <SequenceEmailPreview
              key={selected.id}
              platformPostId={selected.id}
            />
          </div>
        )}
      </SimpleDialog>
    </>
  );
}
