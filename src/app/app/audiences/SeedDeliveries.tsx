"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { SeedShareDialog } from "@/components/seed-share-dialog";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";

const STAGE_LABEL = {
  not_built: "Not built",
  built: "Built",
  uploading: "Uploading",
  uploaded: "Uploaded to Wander",
  lookalike: "Needs sharing",
  shared: "Shared",
} as const;

/** Seed lists across brands and where each stands; the needs-sharing queue first. */
export function SeedDeliveries() {
  const queryClient = useQueryClient();
  const [onlySharing, setOnlySharing] = useState(false);
  const deliveries = useQuery(orpc.seed.deliveries.queryOptions({ input: {} }));
  const rows = (deliveries.data ?? [])
    .filter((d) => !onlySharing || d.stage === "lookalike")
    .sort(
      (a, b) =>
        Number(b.stage === "lookalike") - Number(a.stage === "lookalike"),
    );
  const waiting = (deliveries.data ?? []).filter(
    (d) => d.stage === "lookalike",
  ).length;
  return (
    <section className="mx-auto w-full max-w-4xl space-y-3 @xl:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Seed lookalikes
        </h2>
        <Button
          size="sm"
          variant={onlySharing ? "default" : "outline"}
          onClick={() => setOnlySharing(!onlySharing)}
        >
          Needs sharing · {waiting}
        </Button>
      </div>
      {deliveries.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">No seed lists.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Seed list</th>
                <th className="px-3 py-2 font-medium">Entries</th>
                <th className="px-3 py-2 font-medium">Lookalike</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.seedListId} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {d.brandSlug ? (
                      <Link
                        className="hover:underline"
                        href={`/app/brands/${d.brandSlug}`}
                      >
                        {d.brandName}
                      </Link>
                    ) : (
                      d.brandName
                    )}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2">
                    {d.seedListName}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {(
                      d.snapshot?.entries ?? d.snapshot?.memberCount
                    )?.toLocaleString() ?? "–"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {d.lookalike?.metaAudienceId ?? "–"}
                  </td>
                  <td className="px-3 py-2">{STAGE_LABEL[d.stage]}</td>
                  <td className="px-3 py-2 text-right">
                    {d.share && (
                      <SeedShareDialog
                        share={d.share}
                        onShared={() =>
                          void queryClient.invalidateQueries({
                            queryKey: orpc.seed.deliveries.key(),
                          })
                        }
                        trigger={
                          <Button
                            size="sm"
                            variant={
                              d.stage === "lookalike" ? "default" : "ghost"
                            }
                          >
                            {d.stage === "lookalike" ? "Share" : "Details"}
                          </Button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
