"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/**
 * Wipe one brand's series shelf. Typing the brand name is the gate, matching
 * how organization deletion asks: a shelf is slow to rebuild by hand, and this
 * is a permanent delete with nothing to restore from.
 *
 * The ideas that sat in these series are not deleted. They lose their series and
 * stay in the content pipeline, which is what makes clearing safe to offer here.
 */
export function ClearSeriesButton({
  brandId,
  brandName,
  count,
}: {
  brandId: string;
  brandName: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();
  const trpc = useTRPC();

  const clear = useMutation(
    trpc.series.clearForBrand.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Deleted ${result?.deleted ?? 0} series${
            result?.detachedIdeas
              ? `, ${result.detachedIdeas} idea(s) kept and detached`
              : ""
          }.`,
        );
        setOpen(false);
        setConfirmText("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (count === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive h-7 gap-1.5 text-xs"
        >
          <Trash2 className="size-3.5" />
          Clear all
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete all {count} series for {brandName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This is permanent and there is no trash to restore from. Cadence
              targets attached to these series go with them.
            </p>
            <p>
              Content ideas are not deleted. They stay in the pipeline and
              simply lose their series.
            </p>
            <div className="space-y-2">
              <p className="font-medium">
                Type <span className="font-bold">{brandName}</span> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="Type the brand name"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clear.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => clear.mutate({ brandId })}
            disabled={confirmText !== brandName || clear.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {clear.isPending ? "Deleting..." : `Delete ${count} series`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
