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
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/** Permanent delete for one series. Its ideas survive and detach. */
export function DeleteSeriesButton({
  seriesId,
  name,
  ideas,
}: {
  seriesId: string;
  name: string;
  ideas: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();

  const purge = useMutation(
    trpc.series.purge.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Deleted “${result?.name ?? name}”${
            result?.detachedIdeas
              ? `, ${result.detachedIdeas} idea(s) kept and detached`
              : ""
          }.`,
        );
        setOpen(false);
        router.push("/app/series");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" tone="muted-danger" textSize="xs">
          <Trash2 className="size-3.5" />
          Delete series
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {ideas > 0
              ? `Permanent, with no trash to restore from. The ${ideas} idea(s) in this series are not deleted: they stay in the pipeline and lose their series.`
              : "Permanent, with no trash to restore from. Nothing is planned under it."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={purge.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => purge.mutate({ seriesId })}
            disabled={purge.isPending}
            tone="destructive"
          >
            {purge.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
