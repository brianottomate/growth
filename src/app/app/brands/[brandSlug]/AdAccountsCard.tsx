"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Meta",
  google: "Google",
};

/**
 * The allowlist's UI. The page itself shows only what is allowed — the
 * decision surface (everything the client's OAuth can reach, allow/deny)
 * lives in a dialog, because it is visited once per onboarding and the live
 * Zernio enumeration it needs is too slow to run on every page view.
 */
export function AdAccountsCard({
  brandId,
  brandSlug,
}: {
  brandId: string;
  brandSlug: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Cheap registry-only read for the page; live discovery only in the dialog.
  const allowedQuery = useQuery(
    trpc.brand.adAccounts.queryOptions({ brandId, discover: false }),
  );
  const discoveredQuery = useQuery(
    trpc.brand.adAccounts.queryOptions(
      { brandId, discover: true },
      { enabled: open },
    ),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.brand.adAccounts.queryKey({ brandId }),
    });

  const decide = useMutation(
    trpc.brand.setAdAccountAllowed.mutationOptions({ onSuccess: invalidate }),
  );
  const sync = useMutation(trpc.brand.syncRecentAds.mutationOptions());

  const allowed = (allowedQuery.data ?? []).filter(
    (row) => row.allowed === true,
  );
  const discovered = discoveredQuery.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Ad accounts</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            The accounts this brand&apos;s reporting and sync may consume.
          </p>
        </div>
        {allowed.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Manage
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={sync.isPending}
              onClick={() => sync.mutate({ brandId, limit: 10 })}
            >
              <DownloadCloud className="size-3.5" />
              Pull recent ads
            </Button>
          </div>
        )}
      </div>

      <div className="border-border rounded-xl border">
        {allowedQuery.isPending ? (
          <p className="text-muted-foreground p-4 text-sm">Loading…</p>
        ) : allowed.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-4">
            <p className="text-muted-foreground text-sm">
              No ad accounts allowed yet. Once the client connects Meta or
              Google Ads, pick which of their accounts belong to this brand.
            </p>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-3.5" />
              Choose ad accounts
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {allowed.map((row) => (
              <div
                key={`${row.platform}:${row.externalId}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.name ?? row.externalId}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {PLATFORM_LABEL[row.platform] ?? row.platform} ·{" "}
                    {row.externalId}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-emerald-400">
                  Allowed
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sync.data && (
        <p className="text-muted-foreground text-xs">
          Pulled {sync.data.inserted} new and updated {sync.data.updated}{" "}
          campaigns ({sync.data.filteredOut} older ones left out) —{" "}
          <Link href={`/app/brands/${brandSlug}/ads`} className="underline">
            view ads
          </Link>
          .
        </p>
      )}
      {sync.error && (
        <p className="text-xs text-red-300">{sync.error.message}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose ad accounts</DialogTitle>
            <DialogDescription>
              Everything this brand&apos;s ad connections can reach. A
              client&apos;s login often sees accounts that aren&apos;t theirs —
              allow only the ones that belong to this brand.
            </DialogDescription>
          </DialogHeader>

          {discoveredQuery.isPending ? (
            <p className="text-muted-foreground py-4 text-sm">
              Asking the connections what they can see…
            </p>
          ) : discovered.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              Nothing visible yet. Accounts appear here once Meta Ads or Google
              Ads is connected via the client link.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {discovered.map((row) => (
                <div
                  key={`${row.platform}:${row.externalId}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.name ?? row.externalId}
                      {!row.discovered && (
                        <span className="text-muted-foreground/60 ml-2 text-xs">
                          not visible to any connection
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {PLATFORM_LABEL[row.platform] ?? row.platform} ·{" "}
                      {row.externalId}
                    </p>
                  </div>
                  {row.ownedByBrand ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      registered to {row.ownedByBrand}
                    </span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {row.allowed === true ? (
                        <span className="text-xs font-medium text-emerald-400">
                          Allowed
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              brandId,
                              platform: row.platform,
                              externalId: row.externalId,
                              name: row.name,
                              isAllowed: true,
                            })
                          }
                        >
                          Allow
                        </Button>
                      )}
                      {row.allowed !== false ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground h-7"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              brandId,
                              platform: row.platform,
                              externalId: row.externalId,
                              name: row.name,
                              isAllowed: false,
                            })
                          }
                        >
                          Deny
                        </Button>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">
                          Denied
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {decide.error && (
            <p className="text-xs text-red-300">{decide.error.message}</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
