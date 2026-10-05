"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { textAdCopySchema, textAdReady } from "@/lib/ad-authoring";
import type { AdTextContent } from "@/server/db/ads-schema";
import { orpc } from "@/orpc/client";

type TextIdea = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  content: AdTextContent;
};

function TextAdForm({
  ad,
  brandId,
  website,
  onSaved,
}: {
  ad?: TextIdea;
  brandId: string;
  website: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ad?.name ?? "");
  const [headlines, setHeadlines] = useState(
    ad?.content.headlines ?? ["", "", ""],
  );
  const [descriptions, setDescriptions] = useState(
    ad?.content.descriptions ?? ["", ""],
  );
  const [linkUrl, setLinkUrl] = useState(ad?.content.linkUrl ?? website ?? "");
  const router = useRouter();
  const onSuccess = () => {
    toast.success(ad ? "Text ad saved" : "Text ad created");
    onSaved();
    router.refresh();
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const create = useMutation(
    orpc.ads.draftAd.mutationOptions({ onSuccess, onError }),
  );
  const save = useMutation(
    orpc.ads.setAdCopy.mutationOptions({ onSuccess, onError }),
  );
  const copy = {
    headlines: headlines.map((s) => s.trim()).filter(Boolean),
    descriptions: descriptions.map((s) => s.trim()).filter(Boolean),
    linkUrl: linkUrl.trim() || undefined,
  };
  const valid =
    textAdCopySchema.safeParse(copy).success && Boolean(name.trim());
  const fields = (
    kind: "headlines" | "descriptions",
    values: string[],
    update: (value: string[]) => void,
    max: number,
    chars: number,
  ) => (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        {kind === "headlines" ? "Headlines" : "Descriptions"} · {values.length}/
        {max}
      </legend>
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`${kind === "headlines" ? "Headline" : "Description"} ${i + 1}`}
            value={value}
            onChange={(event) =>
              update(values.map((v, n) => (n === i ? event.target.value : v)))
            }
            aria-invalid={value.length > chars}
          />
          <span
            className={`shrink-0 text-xs ${value.length > chars ? "text-destructive" : "text-muted-foreground"}`}
          >
            {value.length}/{chars}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${kind === "headlines" ? "headline" : "description"} ${i + 1}`}
            disabled={values.length === 1}
            onClick={() => update(values.filter((_, n) => n !== i))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={values.length >= max}
        onClick={() => update([...values, ""])}
      >
        Add {kind === "headlines" ? "headline" : "description"}
      </Button>
    </fieldset>
  );
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="text-ad-name">Ad name</Label>
        <Input
          id="text-ad-name"
          value={name}
          readOnly={Boolean(ad)}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="text-ad-url">Landing URL</Label>
        <Input
          id="text-ad-url"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </div>
      {fields("headlines", headlines, setHeadlines, 15, 30)}
      {fields("descriptions", descriptions, setDescriptions, 4, 90)}
      <p className="text-xs text-muted-foreground">
        Save partial copy as a draft. Search delivery needs at least 3 headlines
        and 2 descriptions. Each line should work in any combination.
      </p>
      <Button
        disabled={!valid}
        loading={create.isPending || save.isPending}
        onClick={() =>
          ad
            ? save.mutate({
                adId: ad.id,
                text: copy,
                expectedUpdatedAt: ad.updatedAt,
              })
            : create.mutate({
                brandId,
                name: name.trim(),
                type: "text",
                ...copy,
              })
        }
      >
        Save draft
      </Button>
    </div>
  );
}

export function NewTextAdButton({
  brandId,
  website,
}: {
  brandId: string;
  website: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SimpleDialog
      open={open}
      onOpenChange={setOpen}
      title="Create a text-first ad"
      size="lg"
      trigger={
        <Button variant="outline" size="sm">
          Add text ad
        </Button>
      }
    >
      {open && (
        <TextAdForm
          brandId={brandId}
          website={website}
          onSaved={() => setOpen(false)}
        />
      )}
    </SimpleDialog>
  );
}

export function TextAdCard({
  ad,
  brandId,
  website,
  deliveryState,
}: {
  ad: TextIdea;
  brandId: string;
  website: string | null;
  deliveryState?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onError = (error: { message: string }) => toast.error(error.message);
  const status = useMutation(
    orpc.ads.setAdStatus.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const remove = useMutation(
    orpc.ads.deleteAd.mutationOptions({
      onSuccess: () => router.refresh(),
      onError,
    }),
  );
  const approved = ad.status === "approved";
  const ready = textAdReady(ad.content);
  return (
    <article className="space-y-4 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{ad.name}</h3>
          <p className="text-xs text-muted-foreground">
            Text-first · {deliveryState ?? (approved ? "Approved" : "Draft")}
          </p>
        </div>
        {!deliveryState && (
          <div className="flex flex-wrap gap-2">
            {!approved && (
              <SimpleDialog
                open={open}
                onOpenChange={setOpen}
                title="Edit text ad"
                size="lg"
                trigger={
                  <Button size="sm" variant="outline">
                    Edit copy
                  </Button>
                }
              >
                {open && (
                  <TextAdForm
                    ad={ad}
                    brandId={brandId}
                    website={website}
                    onSaved={() => setOpen(false)}
                  />
                )}
              </SimpleDialog>
            )}
            <Button
              size="sm"
              variant={approved ? "outline" : "default"}
              disabled={!approved && !ready}
              loading={status.isPending}
              onClick={() =>
                status.mutate({
                  adId: ad.id,
                  status: approved ? "drawn" : "approved",
                  expectedUpdatedAt: ad.updatedAt,
                })
              }
            >
              {approved ? "Reopen" : "Approve"}
            </Button>
            <SimpleDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete text ad?"
              trigger={
                <Button size="sm" variant="ghost">
                  Delete
                </Button>
              }
              footer={
                <Button
                  variant="destructive"
                  size="sm"
                  loading={remove.isPending}
                  onClick={() => remove.mutate({ adId: ad.id })}
                >
                  Delete ad
                </Button>
              }
            >
              <p>This removes “{ad.name}” from your local ads.</p>
            </SimpleDialog>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <div
          className="space-y-2 rounded-lg bg-muted/30 p-4"
          aria-label="Illustrative search preview"
        >
          <p className="text-xs text-muted-foreground">
            Search preview · illustrative combination
          </p>
          <p className="truncate text-xs">{ad.content.linkUrl ?? website}</p>
          <p className="text-lg font-medium text-primary">
            {ad.content.headlines.slice(0, 3).join(" | ")}
          </p>
          <p className="text-sm">
            {ad.content.descriptions.slice(0, 2).join(" ")}
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 font-medium">
              Headlines · {ad.content.headlines.length}/15
            </p>
            <ul className="space-y-1">
              {ad.content.headlines.map((s, i) => (
                <li key={i}>
                  {s}{" "}
                  <span className="text-xs text-muted-foreground">
                    {s.length}/30
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">
              Descriptions · {ad.content.descriptions.length}/4
            </p>
            <ul className="space-y-1">
              {ad.content.descriptions.map((s, i) => (
                <li key={i}>
                  {s}{" "}
                  <span className="text-xs text-muted-foreground">
                    {s.length}/90
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {!approved && !ready && (
        <p className="text-xs text-muted-foreground">
          Add at least 3 headlines and 2 descriptions within the character
          limits before approval.
        </p>
      )}
    </article>
  );
}
