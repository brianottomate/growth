"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { textAdCopySchema } from "@/lib/ad-authoring";
import type { AdTextContent } from "@/server/db/ads-schema";
import { orpc } from "@/orpc/client";

type TextIdea = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  content: AdTextContent;
};

export function TextAdForm({
  ad,
  brandId,
  website,
  campaignId,
  onSaved,
}: {
  campaignId?: string | null;
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
        <Label htmlFor="text-ad-url">Landing URL (optional)</Label>
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
              })
            : create.mutate({
                ...(campaignId ? { campaignId } : { brandId }),
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
