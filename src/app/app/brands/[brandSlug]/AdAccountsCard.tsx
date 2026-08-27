"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Meta",
  google: "Google",
};

/**
 * The allowlist's UI. Client OAuth tokens see every ad account the person
 * manages, so each discovered account is an explicit human decision: allow
 * (reporting and sync may consume it) or deny (recorded, self-documenting).
 * Undecided means denied — this page just makes the denial visible.
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

  const accounts = useQuery(trpc.brand.adAccounts.queryOptions({ brandId }));
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.brand.adAccounts.queryKey({ brandId }),
    });

  const decide = useMutation(
    trpc.brand.setAdAccountAllowed.mutationOptions({ onSuccess: invalidate }),
  );
  const sync = useMutation(trpc.brand.syncRecentAds.mutationOptions());

  const rows = accounts.data ?? [];
  const hasAllowed = rows.some((row) => row.allowed === true);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Ad accounts</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            What this brand&apos;s ad connections can reach. Nothing is pulled
            in until you allow an account — a client&apos;s login often sees
            accounts that aren&apos;t theirs.
          </p>
        </div>
        {hasAllowed && (
          <Button
            size="sm"
            variant="outline"
            loading={sync.isPending}
            onClick={() => sync.mutate({ brandId, limit: 10 })}
          >
            <DownloadCloud className="size-3.5" />
            Pull recent ads
          </Button>
        )}
      </div>

      <div className="border-border rounded-xl border">
        {accounts.isPending ? (
          <p className="text-muted-foreground p-4 text-sm">
            Checking the connections…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No ad accounts visible yet. They appear here once Meta Ads or
            Google Ads is connected via the client link.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row) => (
              <div
                key={`${row.platform}:${row.externalId}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
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
      </div>

      {decide.error && (
        <p className="text-xs text-red-300">{decide.error.message}</p>
      )}
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
    </section>
  );
}
