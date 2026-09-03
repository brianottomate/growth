"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type LibraryAsset = RouterOutputs["media"]["list"][number];
type Taxonomy = RouterOutputs["media"]["taxonomy"];

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readAnalysis(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).aiAnalysis;
  if (!value || typeof value !== "object") return null;
  const analysis = value as Record<string, unknown>;
  const lessons = Array.isArray(analysis.reusableLessons)
    ? analysis.reusableLessons.filter(
        (lesson): lesson is string => typeof lesson === "string",
      )
    : [];
  return {
    description: text(analysis.description),
    analyzedAt: text(analysis.analyzedAt),
    // Video only. `evidence` says whether the model saw the storyboard or a
    // single poster frame, which is the difference between a read and a guess.
    summary: text(analysis.summary),
    hook: text(analysis.hook),
    lessons,
    evidence:
      analysis.evidence === "storyboard" || analysis.evidence === "poster"
        ? analysis.evidence
        : null,
    transcriptError: text(analysis.transcriptError),
  };
}

export function OrganizeMediaDialog({
  asset,
  taxonomy,
  brands = [],
  open,
  onOpenChange,
}: {
  asset: LibraryAsset;
  taxonomy: Taxonomy;
  /** Brands the operator can move this asset to. Omitted hides the control. */
  brands?: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const moveToBrand = useMutation(
    trpc.media.moveToBrand.mutationOptions({
      onSuccess: () => {
        toast.success("Moved to the other brand's library");
        void queryClient.invalidateQueries(trpc.media.list.queryFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const [title, setTitle] = useState(asset.title ?? asset.filename ?? "");
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [folderId, setFolderId] = useState(asset.folderId ?? "unfiled");
  const [steer, setSteer] = useState("");
  const [humanTagIds, setHumanTagIds] = useState(
    () =>
      new Set(
        asset.tagAssignments
          .filter((assignment) => assignment.source === "human")
          .map((assignment) => assignment.tagId),
      ),
  );
  const aiTagIds = new Set(
    asset.tagAssignments
      .filter((assignment) => assignment.source === "ai")
      .map((assignment) => assignment.tagId),
  );
  const analysis = readAnalysis(asset.metadata);
  const listKey = trpc.media.list.queryOptions({
    brandId: asset.brandId,
  }).queryKey;

  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });
  const update = useMutation(
    trpc.media.updateMeta.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const analyze = useMutation(
    trpc.media.analyze.mutationOptions({
      onSuccess: async () => {
        toast.success("Image analyzed");
        setSteer("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Organize media</DialogTitle>
          <DialogDescription>
            Choose the folder and human-managed tags for this asset.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Alt text</Label>
            <Input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Folder</Label>
            <SimpleSelect
              value={folderId}
              onValueChange={setFolderId}
              options={[
                { value: "unfiled", label: "Unfiled" },
                ...taxonomy.folders.map((folder) => ({
                  value: folder.id,
                  label: folder.name,
                })),
              ]}
              aria-label="Folder"
            />
          </div>
          {brands.length > 1 && (
            <div className="grid gap-1.5">
              <Label>Brand</Label>
              <SimpleSelect
                value={asset.brandId}
                onValueChange={(nextBrandId) => {
                  if (nextBrandId === asset.brandId) return;
                  const target = brands.find(
                    (brand) => brand.id === nextBrandId,
                  );
                  if (
                    !window.confirm(
                      `Move "${asset.title ?? asset.filename ?? "this asset"}" to ${target?.name ?? "that brand"}? Its folder and tags are brand-specific and will be cleared.`,
                    )
                  )
                    return;
                  moveToBrand.mutate({
                    mediaId: asset.id,
                    brandId: nextBrandId,
                  });
                }}
                options={brands.map((brand) => ({
                  value: brand.id,
                  label: brand.name,
                }))}
                disabled={moveToBrand.isPending}
                aria-label="Brand"
              />
              {/* Uploading to the wrong brand is a two-click mistake, and the
                  pickers are brand-scoped, so the asset just seems to vanish. */}
              <p className="text-muted-foreground text-xs">
                Moving clears the folder and tags, which belong to the old
                brand. The file itself is not re-uploaded.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Tags</Label>
            {taxonomy.tags.length ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                {taxonomy.tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={humanTagIds.has(tag.id)}
                      onCheckedChange={(checked) =>
                        setHumanTagIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(tag.id);
                          else next.delete(tag.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span>{tag.name}</span>
                      {aiTagIds.has(tag.id) && (
                        <span className="text-muted-foreground ml-1 inline-flex items-center gap-0.5 text-[10px]">
                          <Sparkles className="size-2.5" /> AI
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Create a managed tag from the library’s Organize menu first.
              </p>
            )}
          </div>

          {(asset.kind === "image" || asset.kind === "video") && (
            <div className="bg-muted/30 grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4" />
                <span className="text-sm font-medium">AI analysis</span>
                {analysis?.evidence === "poster" && (
                  <span
                    className="text-muted-foreground text-[11px]"
                    title="No storyboard was cut for this clip, so only one frame was read. Re-upload it to get the full teardown."
                  >
                    · from the poster frame only
                  </span>
                )}
              </div>
              {(analysis?.summary ?? analysis?.description) && (
                <p className="text-muted-foreground text-xs">
                  {analysis?.summary ?? analysis?.description}
                </p>
              )}
              {analysis?.hook && (
                <p className="text-xs">
                  <span className="font-medium">Hook: </span>
                  <span className="text-muted-foreground">{analysis.hook}</span>
                </p>
              )}
              {analysis && analysis.lessons.length > 0 && (
                <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
                  {analysis.lessons.slice(0, 4).map((lesson, index) => (
                    <li key={index}>{lesson}</li>
                  ))}
                </ul>
              )}
              {analysis?.transcriptError && (
                <p className="text-muted-foreground text-[11px]">
                  No transcript: {analysis.transcriptError}
                </p>
              )}
              <Input
                value={steer}
                onChange={(event) => setSteer(event.target.value)}
                placeholder="Optional guidance or correction"
              />
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                loading={analyze.isPending}
                onClick={() =>
                  analyze.mutate({ id: asset.id, steer: steer || undefined })
                }
              >
                <Sparkles className="size-3.5" />
                {analysis
                  ? "Re-analyze"
                  : asset.kind === "video"
                    ? "Analyze video"
                    : "Analyze image"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate({
                id: asset.id,
                title: title.trim(),
                alt: alt.trim(),
                folderId: folderId === "unfiled" ? null : folderId,
                humanTagIds: Array.from(humanTagIds),
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
