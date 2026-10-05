"use client";

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
  const action = useWorkspaceMutation({
    mutationFn: async () => {
      if (kind === "website") return orpc.brand.enrich.call({ brandId });
      return orpc.brand.recheckWebsite.call({ brandId });
    },
  });
  return (
    <div className="space-y-2">
      <Button loading={action.isPending} onClick={() => action.mutate()}>
        {action.isPending
          ? kind === "website"
            ? "Reading website…"
            : "Checking WanderOS…"
          : label}
      </Button>
    </div>
  );
}
