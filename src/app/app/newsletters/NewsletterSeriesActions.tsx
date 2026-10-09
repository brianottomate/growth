"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Link2, Loader2 } from "lucide-react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type Series = { id: string; name: string; description: string | null };

export function NewsletterSeriesActions({
  brandId,
  series,
  available = [],
}: {
  brandId: string;
  series: Series;
  available?: { contentPostId: string; title: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "attach" | null>(null);
  const [name, setName] = useState(series.name);
  const [purpose, setPurpose] = useState(series.description ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const save = useMutation(
    orpc.series.save.mutationOptions({
      onSuccess: () => {
        toast.success(
          mode === "attach" ? "Editions added" : "Newsletter saved",
        );
        setMode(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setName(series.name);
          setPurpose(series.description ?? "");
          setMode("edit");
        }}
      >
        <Pencil className="size-4" /> Edit details
      </Button>
      {available.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected([]);
            setMode("attach");
          }}
        >
          <Link2 className="size-4" /> Add existing broadcasts
        </Button>
      )}
      <Dialog
        open={mode !== null}
        onOpenChange={(value) => {
          if (!value && !save.isPending) setMode(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "attach" ? "Add editions" : "Edit newsletter"}
            </DialogTitle>
            <DialogDescription>
              {mode === "attach"
                ? "These broadcasts become editions of this newsletter and remain visible in Broadcasts."
                : "Update the recurring promise to your readers."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({
                brandId,
                seriesId: series.id,
                name: mode === "attach" ? series.name : name.trim(),
                ...(mode === "attach"
                  ? { contentPostIds: selected }
                  : { description: purpose.trim() || null }),
              });
            }}
          >
            {mode === "attach" ? (
              <div className="space-y-2">
                {available.map((item) => (
                  <label
                    key={item.contentPostId}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      disabled={save.isPending}
                      checked={selected.includes(item.contentPostId)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.contentPostId]
                            : current.filter((id) => id !== item.contentPostId),
                        )
                      }
                    />
                    <span>{item.title}</span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newsletter-name">Newsletter name</Label>
                  <Input
                    id="newsletter-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={120}
                    disabled={save.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newsletter-purpose">Purpose</Label>
                  <Textarea
                    id="newsletter-purpose"
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    maxLength={1000}
                    disabled={save.isPending}
                  />
                </div>
              </>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setMode(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  save.isPending ||
                  (mode === "attach" ? !selected.length : !name.trim())
                }
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {mode === "attach" ? "Add editions" : "Save details"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NewNewsletterEdition({
  brandId,
  seriesId,
}: {
  brandId: string;
  seriesId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const create = useMutation(
    orpc.newsletter.createSlot.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(result.url);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New edition
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!create.isPending) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New edition</DialogTitle>
            <DialogDescription>
              Create a draft in this newsletter, then write it in the shared
              email editor.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                brandId,
                seriesId,
                format: "newsletter.broadcast",
                title: title.trim(),
                plannedAt: plannedAt
                  ? new Date(plannedAt).toISOString()
                  : undefined,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edition-title">Edition title</Label>
              <Input
                id="edition-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
                disabled={create.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edition-date">Planned date (optional)</Label>
              <Input
                id="edition-date"
                type="datetime-local"
                value={plannedAt}
                onChange={(event) => setPlannedAt(event.target.value)}
                disabled={create.isPending}
              />
              <p className="text-xs text-muted-foreground">
                A content-calendar plan. This does not schedule delivery.
              </p>
            </div>
            <DialogFooter>
              <Button disabled={create.isPending || !title.trim()}>
                {create.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}{" "}
                Create edition
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
