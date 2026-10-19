"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Share2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function EmailClientPreviewLink({
  brandId,
  editionIds,
}: {
  brandId: string;
  editionIds?: string[];
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>(editionIds ?? []),
    [days, setDays] = useState(30);
  const options = useQuery({
    ...orpc.emailPreview.options.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const create = useMutation(
    orpc.emailPreview.createLink.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const editions = options.data?.editions ?? [];
  const selectedIds = editions
    .filter((edition) => selected.includes(edition.id))
    .map((edition) => edition.id);
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSelected(editionIds ?? []);
          create.reset();
        }
      }}
      title="Client email preview"
      description="Select emails to export as PDF or share through an expiring, no-login link. Shared links show the latest saved creative. Neither action approves or schedules delivery."
      size="lg"
      scrollable
      trigger={
        <Button size="sm" variant="outline">
          <Share2 className="size-4" />
          Client email preview
        </Button>
      }
    >
      {create.data ? (
        <div className="space-y-4">
          <Input
            aria-label="Client email preview link"
            readOnly
            value={create.data.url}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(create.data.url).then(
                  () => toast.success("Preview link copied"),
                  () => toast.error("Could not copy the link"),
                )
              }
            >
              <Copy className="size-4" />
              Copy link
            </Button>
            <Button asChild>
              <a target="_blank" rel="noreferrer" href={create.data.url}>
                Open preview
              </a>
            </Button>
            <Button asChild variant="outline">
              <a
                target="_blank"
                rel="noreferrer"
                href={`${create.data.url}/print`}
              >
                Save as PDF
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(create.data.expiresAt).toLocaleDateString()}.
            Anyone with this link can view these emails.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {options.isPending ? (
            <p>Loading emails…</p>
          ) : options.error ? (
            <p role="alert">{options.error.message}</p>
          ) : (
            <fieldset className="max-h-80 space-y-2 overflow-y-auto">
              <legend className="mb-2 text-sm font-medium">
                Emails to share · {selectedIds.length} selected
              </legend>
              {editions.map((edition) => (
                <label
                  key={edition.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(edition.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, edition.id]
                          : ids.filter((id) => id !== edition.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {edition.subject}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {edition.series ?? "Standalone broadcast"} ·{" "}
                      {edition.status.replace(/_/g, " ")}
                    </span>
                  </span>
                </label>
              ))}
              {!editions.length && (
                <p className="text-sm text-muted-foreground">
                  Create an email draft before making a client preview.
                </p>
              )}
            </fieldset>
          )}
          <label className="flex items-center gap-3 text-sm">
            Link expires after
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            The PDF captures the selected emails at export time. The online
            preview stays live as you edit. Audience and recipient information
            is never included.
          </p>
          {selectedIds.length > 0 &&
            selectedIds.length <= 24 &&
            !options.isPending &&
            !options.error && (
              <Button asChild>
                <a
                  href={`/api/email-preview/print?${new URLSearchParams([["brandId", brandId], ...selectedIds.map((id) => ["email", id])]).toString()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Export selected as PDF
                </a>
              </Button>
            )}
          <Button
            variant="outline"
            disabled={
              !selectedIds.length ||
              selectedIds.length > 24 ||
              create.isPending ||
              options.isPending ||
              !!options.error
            }
            onClick={() =>
              create.mutate({
                brandId,
                platformPostIds: selectedIds,
                expiresInDays: days,
              })
            }
          >
            {create.isPending ? "Creating…" : "Create client preview link"}
          </Button>
        </div>
      )}
    </SimpleDialog>
  );
}
