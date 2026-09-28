"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
import type { PerformanceSettings } from "@/server/db/brand-schema";

type Saved = NonNullable<PerformanceSettings["metaReportingConversions"]>;

/**
 * The client's site-scoped custom conversion per paying Meta account. Made
 * on demand here, never by a push, because it only counts from its creation.
 */
export function ReportingConversion({
  brandSlug,
  saved,
  host,
}: {
  brandSlug: string;
  saved: Saved;
  /** The brand's website host today; a saved conversion for another is stale. */
  host: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: "meta" },
      enabled: open,
    }),
  );
  const stale = (adAccountId: string) =>
    Boolean(host && saved[adAccountId] && saved[adAccountId].host !== host);
  const options = (destinations.data?.destinations ?? []).filter(
    (row) =>
      row.trackingDefaults &&
      (!saved[row.adAccountId] || stale(row.adAccountId)),
  );
  const loadErrors = [
    ...(destinations.error ? [destinations.error.message] : []),
    ...(destinations.data?.connectionErrors.map((e) => e.message) ?? []),
  ];
  const chosen =
    options.find(
      (row) => `${row.connectionAccountId}:${row.adAccountId}` === key,
    ) ?? (options.length === 1 ? options[0] : undefined);
  const create = useMutation(
    orpc.ads.createReportingConversion.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const rows = Object.entries(saved);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Target className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Reporting conversion</span>
      {rows.map(([adAccountId, row]) => (
        <span
          key={adAccountId}
          className="rounded-full border px-2 py-0.5 text-xs"
          title={`${row.customEventType} on ${row.host} · pixel ${row.pixelId} · ${adAccountId}`}
        >
          {row.name} · {row.customConversionId}
          {stale(adAccountId) && ` · made for ${row.host}`}
        </span>
      ))}
      {!open ? (
        <Button size="sm" shape="round" onClick={() => setOpen(true)}>
          {rows.length
            ? "Add for another account"
            : "Create reporting conversion"}
        </Button>
      ) : destinations.isPending ? (
        <span className="text-muted-foreground">Loading ad accounts…</span>
      ) : options.length === 0 ? (
        <>
          <span className="text-muted-foreground">
            {loadErrors.length
              ? loadErrors.join(" · ")
              : "No ad account with default conversion tracking left to cover."}
          </span>
          {loadErrors.length > 0 && (
            <Button
              size="sm"
              shape="round"
              variant="outline"
              onClick={() => void destinations.refetch()}
            >
              Retry
            </Button>
          )}
        </>
      ) : (
        <>
          {options.length > 1 && (
            <select
              className="rounded border bg-background p-1 text-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              <option value="">Choose ad account</option>
              {options.map((row) => (
                <option
                  key={`${row.connectionAccountId}:${row.adAccountId}`}
                  value={`${row.connectionAccountId}:${row.adAccountId}`}
                >
                  {row.adAccountName ?? row.adAccountId}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            shape="round"
            disabled={!chosen || create.isPending}
            onClick={() =>
              chosen &&
              create.mutate({
                brandSlug,
                connectionAccountId: chosen.connectionAccountId,
                adAccountId: chosen.adAccountId,
              })
            }
          >
            {create.isPending
              ? "Creating…"
              : `Create on ${chosen?.adAccountName ?? chosen?.adAccountId ?? "account"}`}
          </Button>
        </>
      )}
      {create.error && (
        <span role="alert" className="text-destructive">
          {create.error.message}
        </span>
      )}
    </div>
  );
}
