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
import type { BillingSummary } from "@/lib/performance-billing";
import type { BusinessStage, DeliveryStage } from "@/lib/performance-stage";
import { useTRPC } from "@/trpc/react";

import { StageDialog } from "./StageDialog";

/**
 * The quiet menu on a client or prospect row: settle this month's fee or
 * media in one click, set either stage by hand, or delete the brand behind a
 * confirmation. Delete is a soft delete; the brand page's purge is the
 * destructive one.
 */
export function BrandRowMenu({
  brandId,
  brandName,
  business,
  delivery,
  billing,
}: {
  brandId: string;
  brandName: string;
  business: BusinessStage;
  delivery: DeliveryStage;
  billing: BillingSummary | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [staging, setStaging] = useState(false);
  const markLine = useMutation(
    trpc.performance.markLinePaid.mutationOptions({
      onSuccess: (_cycle, input) => {
        toast.success(
          `${brandName}: ${input.line === "fee" ? "fee" : "ads"} ${input.paid ? "paid" : "reopened"}`,
        );
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
  // Money items only once there is a contract to bill against.
  const billable =
    business === "signed" || business === "paid" || business === "paused";
  const feePaid = Boolean(billing?.fee.paidAt);
  const mediaPaid = Boolean(billing?.media.paidAt);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          appearance="icon"
          aria-label={`More for ${brandName}`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {billable ? (
            <>
              <DropdownMenuItem
                disabled={markLine.isPending}
                onClick={() =>
                  markLine.mutate({ brandId, line: "fee", paid: !feePaid })
                }
              >
                {feePaid ? "Reopen fee" : "Mark fee paid"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={markLine.isPending}
                onClick={() =>
                  markLine.mutate({ brandId, line: "media", paid: !mediaPaid })
                }
              >
                {mediaPaid ? "Reopen ads" : "Mark ads paid"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onClick={() => setStaging(true)}>
            Set stages…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            Delete brand…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StageDialog
        brandId={brandId}
        brandName={brandName}
        business={business}
        delivery={delivery}
        open={staging}
        onOpenChange={setStaging}
      />
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
