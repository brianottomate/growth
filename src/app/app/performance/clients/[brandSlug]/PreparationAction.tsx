"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";

export function PreparationAction({
  brandId,
  kind,
  label,
}: {
  brandId: string;
  kind: "website" | "wanderos";
  label: string;
}) {
  const router = useRouter();
  const action = useMutation({
    mutationFn: async () => {
      if (kind === "website") return orpc.brand.enrich.call({ brandId });
      return orpc.brand.recheckWebsite.call({ brandId });
    },
    onSuccess: () => router.refresh(),
  });
  return (
    <div className="space-y-2">
      <Button disabled={action.isPending} onClick={() => action.mutate()}>
        {action.isPending
          ? kind === "website"
            ? "Reading website…"
            : "Checking WanderOS…"
          : label}
      </Button>
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
