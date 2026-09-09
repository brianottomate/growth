"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Link2,
  Shapes,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import {
  type BrandLink,
  type BrandLinkCategory,
} from "@/server/db/brand-schema";

const CATEGORY_ICON: Record<BrandLinkCategory, typeof Link2> = {
  sheet: FileSpreadsheet,
  doc: FileText,
  dashboard: LayoutDashboard,
  design: Shapes,
  other: Link2,
};

/** Guess a category from a URL's host so the user never has to set it. */
function detectCategory(url: string): BrandLinkCategory {
  const u = url.toLowerCase();
  if (u.includes("docs.google.com/spreadsheets") || u.includes("airtable.com"))
    return "sheet";
  if (u.includes("figma.com")) return "design";
  if (
    u.includes("looker") ||
    u.includes("amplitude.com") ||
    u.includes("posthog.com") ||
    u.includes("mode.com") ||
    u.includes("metabase")
  )
    return "dashboard";
  if (
    u.includes("docs.google.com/document") ||
    u.includes("notion.so") ||
    u.includes("coda.io")
  )
    return "doc";
  return "other";
}

/**
 * The brand's linked tools (a tracker Sheet, a doc, a dashboard). The brand is
 * the index; the linked tool stays the system-of-record. Links open from the
 * card's ··· menu; this dialog is where the list is edited. Links are a small
 * bounded array, so every change sends the whole list.
 */
export function BrandLinksDialog({
  brandId,
  links: initial,
  open,
  onOpenChange,
}: {
  brandId: string;
  links: BrandLink[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [links, setLinks] = useState<BrandLink[]>(initial);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const updateM = useMutation(
    trpc.brand.update.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (e) => toast.error(e.message),
    }),
  );

  const persist = (next: BrandLink[]) => {
    setLinks(next);
    updateM.mutate({ id: brandId, links: next });
  };

  const add = () => {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    if (!trimmedLabel) return;
    persist([
      ...links,
      {
        label: trimmedLabel,
        ...(trimmedUrl && { url: trimmedUrl }),
        category: trimmedUrl ? detectCategory(trimmedUrl) : "other",
      },
    ]);
    setLabel("");
    setUrl("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Links</DialogTitle>
          <DialogDescription>
            Trackers, docs and dashboards that belong to this brand. A link
            without a URL is a placeholder to fill in later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {links.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-md border p-1.5">
              {links.map((l, i) => {
                const Icon = CATEGORY_ICON[l.category ?? "other"];
                return (
                  <div
                    key={`${l.label}-${i}`}
                    className="hover:bg-accent group flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  >
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {l.label}
                      {!l.url && (
                        <span className="text-muted-foreground ml-1.5 text-[11px]">
                          no URL yet
                        </span>
                      )}
                    </span>
                    {l.url && (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title={l.url}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => persist(links.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No links yet.</p>
          )}

          <div className="grid grid-cols-[1fr_1.6fr_auto] items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Podcast tour"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="https://docs.google.com/…"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={add}
              disabled={!label.trim() || updateM.isPending}
            >
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
