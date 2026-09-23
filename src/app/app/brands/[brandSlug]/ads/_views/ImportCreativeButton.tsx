"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ImageDown } from "lucide-react";

import { orpc } from "@/orpc/client";

/**
 * Pull a live ad's creative into the brand's media library. Platform CDN
 * urls expire; importing is what makes a proven creative reusable by drafts.
 * Dedupes server-side, so a re-click is a no-op that still reports success.
 */
export function ImportCreativeButton({
  platformAdId,
}: {
  platformAdId: string;
}) {
  const [done, setDone] = useState(false);
  const importCreative = useMutation(
    orpc.ads.importAdCreative.mutationOptions({
      onSuccess: () => setDone(true),
    }),
  );
  return (
    <button
      type="button"
      disabled={importCreative.isPending || done}
      title={
        done
          ? "In the media library"
          : importCreative.error
            ? importCreative.error.message
            : "Import creative to the media library"
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        importCreative.mutate({ platformAdId });
      }}
      className="absolute top-1 left-1 rounded-full bg-black/60 p-1 text-white hover:bg-black disabled:opacity-70"
    >
      {done ? (
        <Check className="size-3 text-emerald-300" />
      ) : (
        <ImageDown
          className={`size-3 ${importCreative.error ? "text-red-300" : ""}`}
        />
      )}
    </button>
  );
}
