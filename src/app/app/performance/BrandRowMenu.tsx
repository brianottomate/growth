"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

/**
 * The quiet menu on a client or prospect row: move it to the other list, or
 * delete the brand behind a confirmation. Delete is a soft delete; the brand
 * page's purge is the destructive one.
 */
export function BrandRowMenu({
  brandId,
  brandName,
  relationship,
}: {
  brandId: string;
  brandName: string;
  relationship: "client" | "prospect";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const setRelationship = useMutation(
    trpc.performance.setBrandRelationship.mutationOptions({
      onSuccess: (brand) => {
        toast.success(`${brandName} is now a ${brand.relationship}`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.brand.delete.mutationOptions({
      onSuccess: () => {
        toast.success(`${brandName} deleted`);
        setConfirming(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const other = relationship === "client" ? "prospect" : "client";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full p-1.5"
          aria-label={`More for ${brandName}`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            disabled={setRelationship.isPending}
            onClick={() => setRelationship.mutate({ brandId, relationship: other })}
          >
            {other === "prospect" ? "Back to prospects" : "Mark as signed"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            Delete brand…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {brandName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The brand leaves every list. Its campaigns, media and intake stay
              in the database and can be restored by an engineer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate({ id: brandId });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
