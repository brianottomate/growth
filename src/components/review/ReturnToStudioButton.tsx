"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
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
  updatedAt,
  studioHref,
  pushed = false,
  menu = false,
}: {
  adId: string;
  updatedAt: string;
  studioHref?: string;
  pushed?: boolean;
  menu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const router = useRouter();
  const mutation = useMutation(
    orpc.ads.returnToStudio.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        setComment("");
        toast.success(
          result.platformAdsUnchanged
            ? "Returned to Studio. Existing platform ads are unchanged."
            : "Returned to Studio as a draft.",
        );
        if (result.mediaCleanup.errors.length)
          toast.warning(
            "Returned to Studio. Some exported files could not be removed.",
          );
        if (studioHref) router.push(`${studioHref}#ad-${adId}`);
        router.refresh();
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
              Return to Studio
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Return to Studio
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Studio</DialogTitle>
            <DialogDescription>
              This ad leaves its campaign and becomes an editable draft. Its
              comments stay with it, and it will need approval again. Unused
              exports are removed; source artwork stays.
              {pushed &&
                " Existing platform ads will stay unchanged and may still be running. Pause them separately if needed."}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Comment (optional)
            <textarea
              aria-label="Reason for returning to Studio"
              className="min-h-24 w-full rounded-md border bg-background p-3"
              maxLength={8000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What needs to change?"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  adId,
                  expectedUpdatedAt: updatedAt,
                  comment,
                  as: "user",
                })
              }
            >
              Return to Studio
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
