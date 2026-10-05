"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export type HandHome = {
  id: string;
  name: string;
  facts: string;
};

/**
 * For a brand with no WanderOS feed to read: paste a list and the agent pulls
 * out the homes it names, plus the homes already on record. The feed path (the
 * pickable photo roster) is HomesStrip; this is the fallback that keeps the
 * Homes tab whole when there is nothing to read.
 */
export function AddHomesByHand({
  brandId,
  brandSlug,
  brandWebsite,
  homes,
}: {
  brandId: string;
  brandSlug: string;
  brandWebsite: string | null;
  homes: HandHome[];
}) {
  const router = useRouter();
  const [paste, setPaste] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const shells = useMutation(
    orpc.brand.homesShellsFromText.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Added ${result.added} home${result.added === 1 ? "" : "s"}.`,
        );
        setPaste("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const drop = useMutation(
    orpc.brand.homesRemove.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
      onSettled: () => setBusyId(null),
    }),
  );

  return (
    <div className="space-y-4">
      {homes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
          {homes.map((home) => (
            <li
              key={home.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5"
            >
              <Link
                href={`/app/performance/clients/${brandSlug}/homes/${home.id}`}
                className="min-w-0"
              >
                <div className="truncate text-xs font-medium hover:underline">
                  {home.name}
                </div>
                {home.facts ? (
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {home.facts}
                  </div>
                ) : null}
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0"
                onClick={() => {
                  setBusyId(home.id);
                  drop.mutate({ brandId, homeId: home.id });
                }}
                disabled={busyId === home.id}
              >
                {busyId === home.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Paste the homes
        </div>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Paste an email, a list, or a table and the agent pulls out the homes
          it names. Only stated facts are kept.
        </p>
        <Textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={6}
          placeholder={
            "Sycamore — 3 bd, sleeps 8, Logan OH\nElk Ridge, 2 bedrooms, $240/night\n..."
          }
          className={cn("max-w-2xl")}
        />
        <Button
          size="sm"
          onClick={() => shells.mutate({ brandId, text: paste })}
          disabled={shells.isPending || paste.trim().length === 0}
        >
          {shells.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Reading…
            </>
          ) : (
            "Create homes from this"
          )}
        </Button>
      </div>
    </div>
  );
}
