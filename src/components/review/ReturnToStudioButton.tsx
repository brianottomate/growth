"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MoreHorizontal, Undo2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function ReturnToStudioButton({
  adId,
  studioHref,
  pushed = false,
  menu = false,
  inStudio = false,
  assigned = true,
}: {
  adId: string;
  studioHref?: string;
  pushed?: boolean;
  menu?: boolean;
  inStudio?: boolean;
  assigned?: boolean;
}) {
  const label = inStudio ? "Reopen" : "Return to Studio";
  const completed = inStudio
    ? "Reopened as a draft."
    : "Returned to Studio as a draft.";
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [followToStudio, setFollowToStudio] = useState(false);
  const followId = useId();
  const router = useRouter();
  const mutation = useMutation(
    orpc.ads.returnToStudio.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        setComment("");
        setFollowToStudio(false);
        toast.success(
          result.platformAdsUnchanged
            ? `${completed} Existing platform ads are unchanged.`
            : completed,
        );
        if (result.mediaCleanup.errors.length)
          toast.warning(
            `${completed} Some exported files could not be removed.`,
          );
        if (studioHref && followToStudio) {
          // Load the newly reopened draft rather than a prefetched Studio page.
          window.location.assign(`${studioHref}#ad-${adId}`);
        } else {
          router.refresh();
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <>
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Ad actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setOpen(true)}>
              <Undo2 className="size-4" />
              {label}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (mutation.isPending) return;
          if (!nextOpen) {
            setComment("");
            setFollowToStudio(false);
            mutation.reset();
          }
          setOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {assigned
                ? "This ad leaves its campaign and becomes an editable draft. "
                : "This ad becomes an editable draft. "}
              Its comments stay with it, and it will need approval again. Unused
              exports are removed in the background; source artwork stays.
              {pushed &&
                " Existing platform ads will stay unchanged and may still be running. Pause them separately if needed."}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Comment (optional)
            <textarea
              aria-label="Reopening comment"
              className="min-h-24 w-full rounded-md border bg-background p-3"
              maxLength={8000}
              disabled={mutation.isPending}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What needs to change?"
            />
          </label>
          {studioHref && !inStudio && (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <label htmlFor={followId} className="space-y-1 text-sm">
                <span className="block font-medium">Follow to Studio</span>
                <span className="block text-muted-foreground">
                  Open the draft after returning it. Leave off to stay in this
                  campaign.
                </span>
              </label>
              <Switch
                id={followId}
                checked={followToStudio}
                onCheckedChange={setFollowToStudio}
                disabled={mutation.isPending}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setOpen(false);
                setComment("");
                setFollowToStudio(false);
                mutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  adId,
                  comment,
                  as: "user",
                })
              }
            >
              {label}
            </Button>
          </DialogFooter>
          {mutation.error && (
            <p role="alert" className="text-sm">
              {mutation.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
