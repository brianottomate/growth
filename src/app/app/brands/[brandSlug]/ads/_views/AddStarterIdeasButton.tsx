"use client";

import { useState, useTransition } from "react";
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
        disabled={add.isPending || refreshing}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        Add starter ad ideas
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!add.isPending) setOpen(value);
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
              disabled={add.isPending}
              onClick={() => setSource("featured")}
            >
              From featured homes
            </Button>
            <Button
              variant={source === "blank" ? "secondary" : "outline"}
              disabled={add.isPending}
              onClick={() => setSource("blank")}
            >
              Start blank
            </Button>
          </div>
          {source === "blank" ? (
            <p className="text-sm text-muted-foreground">
              Nine empty ideas: one hero carousel, four statics, and four home
              carousels.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Uses the featured WanderOS homes selected on the Homes page.
                Each static starts with its hero image; each home carousel
                starts with up to six photos. Browse the full home gallery later
                to add more.
              </p>
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
              disabled={add.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={add.isPending || unavailable}
              loading={add.isPending}
              onClick={() =>
                add.mutate({
                  campaignId,
                  source,
                  ...(source === "featured"
                    ? { homeIds: available.map((h) => h.id) }
                    : {}),
                })
              }
            >
              Create ideas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
