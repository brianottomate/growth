"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { HomePicker } from "../HomePicker";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

export function StudioGeneration({
  brandId,
  website,
}: {
  brandId: string;
  website: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [source, setSource] = useState<"featured" | "brand">("featured");
  const [stories, setStories] = useState(true);
  const homes = useQuery({
    ...orpc.ads.starterIdeaHomes.queryOptions({
      input: { brandId, allHomes: true },
    }),
    enabled: open,
  });
  const progress = useQuery({
    ...orpc.ads.starterGenerationStatus.queryOptions({ input: { brandId } }),
    refetchInterval: (query) =>
      ["queued", "processing"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const seen = useRef("");
  useEffect(() => {
    const run = progress.data;
    if (!run) return;
    const version = `${run.id}:${run.created}:${run.status}`;
    if (seen.current === version) return;
    seen.current = version;
    router.refresh();
  }, [progress.data, router]);
  const running = ["queued", "processing"].includes(
    progress.data?.status ?? "",
  );
  const generate = useMutation(
    orpc.ads.generateStarterIdeas.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        void progress.refetch();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const available = homes.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <SimpleDialog
          open={open}
          onOpenChange={(next) => {
            if (!generate.isPending) setOpen(next);
          }}
          title="Generate creative-first ads"
          size="lg"
          trigger={
            <Button size="sm" disabled={running}>
              Generate creative ads
            </Button>
          }
          footer={
            <Button
              size="sm"
              disabled={
                running ||
                (source === "featured" &&
                  (!picked.length ||
                    picked.some(
                      (id) =>
                        !available.find((home) => home.id === id)?.photos
                          .length,
                    )))
              }
              loading={generate.isPending}
              onClick={() =>
                generate.mutate({
                  brandId,
                  source,
                  homeIds: source === "brand" ? [] : picked,
                  intendedPlacements: [
                    "facebook-feed",
                    "instagram-feed",
                    ...(stories
                      ? (["facebook-story", "instagram-story"] as const)
                      : []),
                  ],
                })
              }
            >
              Generate drafts
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates fresh drafts with copy, selected photos and editable
              compositions. Approved ads stay as they are.
            </p>
            <div className="flex gap-2">
              <Button
                variant={source === "featured" ? "secondary" : "ghost"}
                onClick={() => setSource("featured")}
              >
                From homes
              </Button>
              <Button
                variant={source === "brand" ? "secondary" : "ghost"}
                onClick={() => setSource("brand")}
              >
                Brand concepts
              </Button>
            </div>
            {source === "featured" && (
              <>
                {homes.isPending ? (
                  <p role="status">Loading home photos…</p>
                ) : homes.isError ? (
                  <p role="alert">
                    Could not load homes. {homes.error.message}
                  </p>
                ) : (
                  <HomePicker
                    homes={available.map((home) => ({
                      id: home.id,
                      name: home.name,
                      imageUrl: home.photos[0]?.url ?? "",
                      thumbUrl: home.photos[0]?.url ?? null,
                    }))}
                    picked={picked}
                    onChange={setPicked}
                    max={10}
                    label={`Choose homes · ${picked.length}/10`}
                  />
                )}
                <p className="text-sm">
                  One static and one carousel per home, plus a shared hero
                  carousel.
                </p>
                {picked.some(
                  (id) =>
                    !available.find((home) => home.id === id)?.photos.length,
                ) && (
                  <p role="alert">
                    Add photos to each selected home before generating.
                  </p>
                )}
              </>
            )}
            {source === "brand" && (
              <p className="text-sm">
                Three concepts from the brand story. Add photos and finish their
                compositions in Studio.
              </p>
            )}
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={stories}
                onChange={(e) => setStories(e.target.checked)}
              />
              Include Story compositions
            </label>
          </div>
        </SimpleDialog>
        <GenerateTextAds brandId={brandId} website={website} />
      </div>
      {progress.data && (
        <p
          className="text-sm text-muted-foreground"
          role={progress.data.status === "error" ? "alert" : "status"}
        >
          {progress.data.message} · {progress.data.created}/
          {progress.data.total}
          {progress.data.error ? ` · ${progress.data.error}` : ""}
        </p>
      )}
    </div>
  );
}

function GenerateTextAds({
  brandId,
  website,
}: {
  brandId: string;
  website: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [landingUrl, setLandingUrl] = useState(website ?? "");
  const [keywords, setKeywords] = useState("");
  const generate = useWorkspaceMutation(
    orpc.ads.writeGoogleTextAds.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Created ${result.created} text ads`);
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        if (!generate.isPending) setOpen(next);
      }}
      title="Generate text-first ads"
      trigger={
        <Button size="sm" variant="outline" loading={generate.isPending}>
          Generate text ads
        </Button>
      }
      footer={
        <Button
          size="sm"
          loading={generate.isPending}
          disabled={!landingUrl.trim()}
          onClick={() =>
            generate.mutate({
              brandId,
              landingUrl: landingUrl.trim(),
              keywords: keywords
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 40),
            })
          }
        >
          Generate drafts
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Writes search-compatible headline and description pools from the
          landing page and your search themes. No campaign is needed.
        </p>
        <div className="space-y-2">
          <Label htmlFor="generate-text-url">Landing URL</Label>
          <Input
            id="generate-text-url"
            type="url"
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="generate-text-keywords">
            Search themes (optional, one per line)
          </Label>
          <Textarea
            id="generate-text-keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>
      </div>
    </SimpleDialog>
  );
}
