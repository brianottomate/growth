"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export function AddStarterIdeasButton({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"blank" | "featured">("featured");
  const [generate, setGenerate] = useState(true);
  const [stories, setStories] = useState(true);
  const [refreshing, startTransition] = useTransition();
  const homes = useQuery({
    ...trpc.ads.starterIdeaHomes.queryOptions({ campaignId }),
    enabled: open,
  });
  const available = homes.data ?? [];
  const add = useMutation(
    trpc.ads.addStarterIdeas.mutationOptions({
      onSuccess: ({ created }) => {
        toast.success(
          created
            ? `Added ${created} starter ad ideas`
            : "Starter ad ideas already added",
        );
        setOpen(false);
        startTransition(() => router.refresh());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const progress = useQuery({
    ...trpc.ads.starterGenerationStatus.queryOptions({ campaignId }),
    refetchInterval: (query) =>
      ["queued", "processing"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const lastProgress = useRef("");
  useEffect(() => {
    if (!progress.data) return;
    const key = `${progress.data.id}:${progress.data.created}:${progress.data.status}`;
    if (key === lastProgress.current) return;
    lastProgress.current = key;
    startTransition(() => router.refresh());
  }, [progress.data, router]);
  const generating = ["queued", "processing"].includes(
    progress.data?.status ?? "",
  );
  const generation = useMutation(
    trpc.ads.generateStarterIdeas.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        void progress.refetch();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const pending = add.isPending || generation.isPending;
  const unavailable =
    source === "featured" &&
    (homes.isPending ||
      homes.isError ||
      !available.length ||
      available.length > 10 ||
      available.some((home) => !home.photos.length));
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || refreshing || generating}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        Add starter ad ideas
      </Button>
      {progress.data && (
        <div
          role="status"
          aria-live="polite"
          className="basis-full rounded-lg border p-3 text-sm"
        >
          <p>
            {progress.data.message} · {progress.data.created}/
            {progress.data.total} ideas
          </p>
          {generating && (
            <progress
              className="mt-2 h-1 w-full"
              value={progress.data.created}
              max={progress.data.total}
            />
          )}
          {progress.data.status === "error" && (
            <p className="mt-1 text-muted-foreground">{progress.data.error}</p>
          )}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add starter ad ideas</DialogTitle>
            <DialogDescription>
              Create editable ideas in this campaign. Existing ideas are
              preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant={source === "featured" ? "secondary" : "outline"}
              disabled={pending}
              onClick={() => setSource("featured")}
            >
              From featured homes
            </Button>
            <Button
              variant={source === "blank" ? "secondary" : "outline"}
              disabled={pending}
              onClick={() => setSource("blank")}
            >
              Start blank
            </Button>
          </div>
          {source === "blank" ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={generate}
                  onChange={(e) => setGenerate(e.target.checked)}
                />
                Write initial concepts and copy from the brand with AI
              </label>
              <p className="text-sm text-muted-foreground">
                {generate
                  ? "Three brand-based ad ideas with headlines and copy. Add photos and compose them in the ad studio when you’re ready."
                  : "Nine empty ideas: one hero carousel, four statics, and four home carousels."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Uses the featured WanderOS homes selected on the Homes page.
                Generate copy and layouts from real photos and listing details,
                ready to refine in the ad studio.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={generate}
                  onChange={(e) => setGenerate(e.target.checked)}
                />
                Write copy, choose photos and compose with AI
              </label>
              {generate && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stories}
                    onChange={(e) => setStories(e.target.checked)}
                  />
                  Include Stories layouts alongside Facebook and Instagram Feed
                </label>
              )}
              {generate && (
                <p className="text-xs text-muted-foreground">
                  Runs in the background and creates a fresh set of unapproved
                  drafts. Copy is shared within each home’s ads; layouts stay
                  editable.
                </p>
              )}
              {homes.isPending ? (
                <p className="text-sm">Loading featured homes…</p>
              ) : homes.isError ? (
                <p className="text-sm">
                  Could not load homes.{" "}
                  <Button variant="link" onClick={() => void homes.refetch()}>
                    Try again
                  </Button>
                </p>
              ) : available.length === 0 ? (
                <p className="text-sm">
                  No featured WanderOS homes yet. Choose homes on the Homes
                  page, or start blank.
                </p>
              ) : (
                <>
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                    {available.map((home) => (
                      <li key={home.id} className="p-3 text-sm">
                        {home.name}
                        <span className="ml-2 text-muted-foreground">
                          {home.photos.length
                            ? `${home.photos.length} photos available`
                            : "Needs a photo"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    {available.length > 10
                      ? "Choose at most 10 featured homes on the Homes page."
                      : `${1 + 2 * available.length} ideas: one shared hero carousel, plus a static and carousel for each home.`}
                  </p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || unavailable}
              loading={pending}
              onClick={() => {
                if (generate) {
                  generation.mutate({
                    campaignId,
                    source: source === "blank" ? "brand" : "featured",
                    homeIds:
                      source === "featured" ? available.map((h) => h.id) : [],
                    intendedPlacements: [
                      "facebook-feed",
                      "instagram-feed",
                      ...(source === "featured" && stories
                        ? (["facebook-story", "instagram-story"] as const)
                        : []),
                    ],
                  });
                  return;
                }
                add.mutate({
                  campaignId,
                  source,
                  ...(source === "featured"
                    ? { homeIds: available.map((h) => h.id) }
                    : {}),
                });
              }}
            >
              {generate ? "Generate ideas" : "Create ideas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
