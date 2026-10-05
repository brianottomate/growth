"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export function CampaignShellEditor({
  initiativeId,
  primaryBrandId,
  brands,
  close,
}: {
  initiativeId: string;
  primaryBrandId: string | null;
  brands: { id: string; name: string; slug: string | null }[];
  close: () => void;
}) {
  const client = useQueryClient();
  const [brandId, setBrandId] = useState(primaryBrandId ?? "");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  // Retain a successfully created shell if linking fails so retry cannot duplicate it.
  const [createdId, setCreatedId] = useState<string>();
  const create = useMutation(orpc.ads.createDraft.mutationOptions());
  const link = useMutation(orpc.initiative.link.mutationOptions());
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
          let campaignId = createdId;
          if (!campaignId) {
            const brand = brands.find((b) => b.id === brandId);
            if (!brand?.slug)
              throw new Error("Choose a brand with a configured slug.");
            const result = await create.mutateAsync({
              brandSlug: brand.slug,
              name: name.trim(),
              goal: goal.trim() || undefined,
              description: description.trim() || undefined,
              landingUrl: landingUrl.trim() || undefined,
            });
            campaignId = result.campaign.id;
            setCreatedId(campaignId);
          }
          await link.mutateAsync({ id: initiativeId, campaignId });
          await client.invalidateQueries({ queryKey: orpc.initiative.key() });
          close();
          toast.success("Campaign shell created and linked.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not create campaign.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      {createdId && (
        <p className="text-sm text-muted-foreground">
          The shell is saved. Retry linking it to this initiative.
        </p>
      )}
      <fieldset disabled={saving || !!createdId} className="space-y-4">
        <label className="block space-y-1 text-sm">
          Brand
          <SimpleSelect
            value={brandId}
            onValueChange={setBrandId}
            placeholder="Choose brand"
            options={brands
              .filter((b) => b.slug)
              .map((b) => ({ value: b.id, label: b.name }))}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Campaign name
          <Input
            required
            maxLength={300}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Objective
          <Input
            maxLength={200}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Brief
          <Textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Destination
          <Input
            type="url"
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
          />
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Save the campaign first, then develop its ads, audiences and platforms
        individually.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={close}
        >
          Cancel
        </Button>
        <Button disabled={saving || !brandId || !name.trim()}>
          {saving ? "Saving…" : createdId ? "Retry linking" : "Create shell"}
        </Button>
      </div>
    </form>
  );
}
