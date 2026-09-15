"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  AUTO_DELIVERY_STAGES,
  BUSINESS_LABEL,
  BUSINESS_STAGES,
  DELIVERY_LABEL,
  DELIVERY_STAGES,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import { useTRPC } from "@/trpc/react";

/** Set a brand's two stages by hand: any value in either, the tabs follow. */
export function StageDialog({
  brandId,
  brandName,
  business,
  delivery,
  open,
  onOpenChange,
}: {
  brandId: string;
  brandName: string;
  business: BusinessStage;
  delivery: DeliveryStage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pickedBusiness, setPickedBusiness] = useState<BusinessStage>(business);
  const [pickedDelivery, setPickedDelivery] = useState<DeliveryStage>(delivery);
  const dirty = pickedBusiness !== business || pickedDelivery !== delivery;
  const save = useMutation(
    trpc.performance.setStage.mutationOptions({
      onSuccess: () => {
        toast.success(
          `${brandName}: ${BUSINESS_LABEL[pickedBusiness]} · ${DELIVERY_LABEL[pickedDelivery]}`,
        );
        onOpenChange(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stages for {brandName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          <Group label="Business">
            {BUSINESS_STAGES.map((option) => (
              <Option
                key={option}
                label={BUSINESS_LABEL[option]}
                checked={pickedBusiness === option}
                onClick={() => setPickedBusiness(option)}
              />
            ))}
          </Group>
          <Group label="Delivery">
            {DELIVERY_STAGES.map((option) => (
              <Option
                key={option}
                label={DELIVERY_LABEL[option]}
                checked={pickedDelivery === option}
                auto={AUTO_DELIVERY_STAGES.includes(option)}
                onClick={() => setPickedDelivery(option)}
              />
            ))}
          </Group>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={save.isPending || !dirty}
            onClick={() =>
              save.mutate({
                brandId,
                ...(pickedBusiness !== business
                  ? { business: pickedBusiness }
                  : {}),
                ...(pickedDelivery !== delivery
                  ? { delivery: pickedDelivery }
                  : {}),
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

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid content-start gap-1"
    >
      <p className="mb-1 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function Option({
  label,
  checked,
  auto,
  onClick,
}: {
  label: string;
  checked: boolean;
  auto?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
        checked ? "border-foreground" : "border-border/70 hover:bg-muted/50",
      )}
    >
      <span>{label}</span>
      {auto ? (
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
          auto
        </span>
      ) : null}
    </button>
  );
}
