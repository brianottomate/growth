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
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const CATEGORY_OPTIONS: { value: BrandLinkCategory; label: string }[] = [
  { value: "sheet", label: "Sheet" },
  { value: "doc", label: "Doc" },
  { value: "dashboard", label: "Dashboard" },
  { value: "design", label: "Design" },
  { value: "other", label: "Link" },
];

/** Guess a category from a URL's host so the user rarely has to set it. */
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

const NEW = -1;

/**
 * Links rail on a brand card. The brand becomes the index; the linked tool (a
 * tracker Sheet, a doc, a dashboard) stays the system-of-record. A link with no
 * URL is a deliberate placeholder — it renders as a dashed "pending" chip whose
 * only action is to fill in the URL later.
 */
export function BrandLinks({
  brandId,
  links: initial,
}: {
  brandId: string;
  links: BrandLink[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [links, setLinks] = useState<BrandLink[]>(initial);
  // null = closed; NEW = adding; >=0 = editing that index.
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<{
    label: string;
    url: string;
    category: BrandLinkCategory;
  }>({ label: "", url: "", category: "other" });

  const updateM = useMutation(
    trpc.brand.update.mutationOptions({ onSuccess: () => router.refresh() }),
  );

  // Send the whole array on every change — links are a small bounded list.
  const persist = (next: BrandLink[]) => {
    setLinks(next);
    updateM.mutate({ id: brandId, links: next });
  };

  const openNew = () => {
    setForm({ label: "", url: "", category: "other" });
    setEditing(NEW);
  };
  const openEdit = (i: number) => {
    const l = links[i]!;
    setForm({ label: l.label, url: l.url ?? "", category: l.category ?? "other" });
    setEditing(i);
  };

  const save = () => {
    const label = form.label.trim();
    if (!label) return;
    const url = form.url.trim();
    const link: BrandLink = {
      label,
      ...(url && { url }),
      // Auto-detect on save when the user left the category untouched.
      category: url && form.category === "other" ? detectCategory(url) : form.category,
    };
    persist(
      editing === NEW
        ? [...links, link]
        : links.map((l, i) => (i === editing ? link : l)),
    );
    setEditing(null);
  };

  const remove = () => {
    if (editing === null || editing < 0) return;
    persist(links.filter((_, i) => i !== editing));
    setEditing(null);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {links.map((l, i) => {
        const Icon = CATEGORY_ICON[l.category ?? "other"];

        if (l.url) {
          return (
            <span
              key={i}
              className="group/link bg-background hover:border-foreground/20 inline-flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2 text-xs transition-colors"
            >
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground inline-flex items-center gap-1.5 font-medium"
              >
                <Icon className="text-muted-foreground size-3.5" />
                {l.label}
                <ExternalLink className="text-muted-foreground size-3" />
              </a>
              <button
                type="button"
                onClick={() => openEdit(i)}
                title="Edit link"
                className="text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5 rounded p-0.5 opacity-0 transition group-hover/link:opacity-100"
              >
                <Pencil className="size-3" />
              </button>
            </span>
          );
        }

        // Label-only — a pending to-do. The whole chip opens the editor.
        return (
          <button
            key={i}
            type="button"
            onClick={() => openEdit(i)}
            title="Add the link"
            className="text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2 py-1 text-xs"
          >
            <Icon className="size-3.5" />
            {l.label}
            <span className="text-[10px] opacity-70">add link</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={openNew}
        className="text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-xs"
      >
        <Plus className="size-3.5" />
        Add link
      </button>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === NEW ? "Add link" : "Edit link"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Label</Label>
              <Input
                autoFocus
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Podcast tour"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://docs.google.com/…"
              />
              <p className="text-muted-foreground text-xs">
                Optional — leave blank to add it as a placeholder and fill in later.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as BrandLinkCategory }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {editing !== NEW ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={remove}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={!form.label.trim()}>
                {editing === NEW ? "Add" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
