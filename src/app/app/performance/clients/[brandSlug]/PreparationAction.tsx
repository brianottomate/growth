"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useWorkspaceMutation } from "./useWorkspaceMutation";
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
  const mutationKey = ["workspace-preparation", brandId, kind];
  const sharedPending = useIsMutating({ mutationKey, exact: true }) > 0;
  const action = useWorkspaceMutation({
    mutationKey,
    mutationFn: async () => {
      if (kind === "website") return orpc.brand.enrich.call({ brandId });
      return orpc.brand.recheckWebsite.call({ brandId });
    },
  });
  const pending = action.isPending || sharedPending;
  return (
    <Button size="sm" loading={pending} onClick={() => action.mutate()}>
      {pending
        ? kind === "website"
          ? "Reading website…"
          : "Checking WanderOS…"
        : label}
    </Button>
  );
}
