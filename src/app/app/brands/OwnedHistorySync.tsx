"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Download, HardDriveDownload, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export function OwnedHistorySync({ brandId }: { brandId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [months, setMonths] = useState<number | null>(null);
  const sync = useMutation(
    trpc.zernio.syncHistory.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `History synced · ${result.inserted} new, ${result.updated} refreshed`,
        );
        setMonths(null);
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message);
        setMonths(null);
      },
    }),
  );
  const cacheMedia = useMutation(
    trpc.media.cacheBrandPostMedia.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Media cached · ${result.cached} full file${result.cached === 1 ? "" : "s"}${
            result.failed ? ` · ${result.failed} unavailable` : ""
          }`,
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const refreshInstagram = useMutation(
    trpc.media.refreshOwnedInstagramMedia.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Instagram refreshed · ${result.updatedExisting} posts updated · ${result.cached} full files cached`,
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const run = (monthsBack: number) => {
    setMonths(monthsBack);
    sync.mutate({ brandId, monthsBack });
  };

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            loading={sync.isPending}
          >
            <Download className="size-3.5" />
            {sync.isPending ? `Syncing ${months} months…` : "Sync history"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {[3, 6, 12].map((value) => (
            <DropdownMenuItem key={value} onClick={() => run(value)}>
              Fetch the last {value} months
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground gap-1.5"
        loading={cacheMedia.isPending}
        onClick={() => cacheMedia.mutate({ brandId })}
      >
        <HardDriveDownload className="size-3.5" />
        {cacheMedia.isPending ? "Caching media…" : "Cache media"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground gap-1.5"
        loading={refreshInstagram.isPending}
        onClick={() => refreshInstagram.mutate({ brandId })}
      >
        <RefreshCw className="size-3.5" />
        {refreshInstagram.isPending
          ? "Refreshing Instagram…"
          : "Refresh Instagram"}
      </Button>
    </div>
  );
}
