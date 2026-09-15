"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  adPlatformByAllowlistPlatform,
  type AdAccountPlatform,
} from "@/lib/ad-platforms";
import { useTRPC } from "@/trpc/react";

type Row = {
  platform: AdAccountPlatform;
  externalId: string;
  name: string | null;
  allowed: boolean | null;
  sharedFrom: string | null;
  discovered: boolean;
};

/**
 * The allowlist's UI.
 *
 * Deciding which accounts a brand may consume IS this page's job, so the
 * decision is on the page rather than behind a dialog. `allowed: null` and
 * `allowed: false` both deny, so one switch says everything a row's state
 * means; flipping it off writes an explicit deny, which is better provenance
 * than leaving the row undecided.
 *
 * Two reads of the same procedure: the registry-only one paints immediately,
 * the live Zernio enumeration is slow and merges in behind it.
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

  const registryQuery = useQuery(
    trpc.brand.adAccounts.queryOptions({ brandId, discover: false }),
  );
  const discoverQuery = useQuery(
    trpc.brand.adAccounts.queryOptions({ brandId, discover: true }),
  );

  const decide = useMutation(
    trpc.brand.setAdAccountAllowed.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.brand.adAccounts.queryKey({ brandId }),
        }),
    }),
  );
  const sync = useMutation(trpc.brand.syncRecentAds.mutationOptions());

  // Discovery is the fuller answer once it lands; until then the registry is
  // what we know. `discovered` is meaningless on the registry-only read (it
  // skips the enumeration, so every row comes back false) — hence the flag,
  // rather than reading the field off whichever query answered.
  const enumerated = discoverQuery.data !== undefined;
  const rows: Row[] = discoverQuery.data ?? registryQuery.data ?? [];
  const allowedCount = rows.filter((row) => row.allowed === true).length;

  // Allowed first, then the ones still to decide, then the refused.
  const rank = (row: Row) =>
    row.allowed === true ? 0 : row.allowed === null ? 1 : 2;
  const ordered = [...rows].sort(
    (a, b) => rank(a) - rank(b) || (a.name ?? "").localeCompare(b.name ?? ""),
  );

  const loading = registryQuery.isPending && discoverQuery.isPending;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Ad accounts</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything this brand&apos;s ad connections can reach. A
            client&apos;s login often sees accounts that aren&apos;t theirs, so
            nothing is consumed until you switch it on.
          </p>
        </div>
        {allowedCount > 0 && (
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

      <div className="rounded-xl border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : ordered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {enumerated
              ? "Nothing to allow yet. Accounts appear here once the client connects an ad platform through the link above."
              : "Asking the connections what they can see…"}
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {ordered.map((row) => {
              const id = `allow-${row.platform}-${row.externalId}`;
              return (
                <div
                  key={`${row.platform}:${row.externalId}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <p className="truncate text-sm font-medium">
                      {row.name ?? row.externalId}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {adPlatformByAllowlistPlatform(row.platform)
                        ?.shortLabel ?? row.platform}{" "}
                      · {row.externalId}
                      {row.sharedFrom ? ` · ${row.sharedFrom}'s account` : ""}
                    </p>
                  </label>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {/* Allowed, but no live connection can see it any more —
                        the sync is quietly buying nothing. */}
                    {row.allowed === true && enumerated && !row.discovered && (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <TriangleAlert className="size-3.5" />
                        no connection sees it
                      </span>
                    )}
                    <Switch
                      id={id}
                      checked={row.allowed === true}
                      disabled={decide.isPending}
                      onCheckedChange={(next) =>
                        decide.mutate({
                          brandId,
                          platform: row.platform,
                          externalId: row.externalId,
                          name: row.name,
                          isAllowed: next,
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!enumerated && ordered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Asking the connections what else they can see…
        </p>
      )}

      {decide.error && (
        <p className="text-xs text-red-300">{decide.error.message}</p>
      )}
      {sync.data && (
        <p className="text-xs text-muted-foreground">
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
