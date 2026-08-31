"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/** Remove one drafted ad. Refused server-side once the ad is live. */
export function DeleteAdButton({ adId }: { adId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const remove = useMutation(
    trpc.ads.deleteDraftAd.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <button
      type="button"
      onClick={() => remove.mutate({ adId })}
      disabled={remove.isPending}
      title={remove.error?.message}
      className="absolute top-1.5 left-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
    >
      {remove.isPending ? "Removing…" : "Delete"}
    </button>
  );
}
