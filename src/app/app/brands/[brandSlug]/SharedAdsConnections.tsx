"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { TrackingDefaults } from "./TrackingDefaults";
import { Button } from "@/components/ui/button";
import type {
  saveSharedAdsConnection,
  sharedAdsConnections,
} from "@/server/services/ads-connection.service";
type State = Awaited<ReturnType<typeof sharedAdsConnections>>;
export function SharedAdsConnections({ brandId }: { brandId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [destinationKey, setDestinationKey] = useState("");
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const url = `/api/performance/ads-connections/${brandId}`;
  const query = useQuery({
    queryKey: ["shared-ads-connections", brandId],
    enabled: open,
    queryFn: async (): Promise<State> => {
      const response = await fetch(url);
      const data = (await response.json()) as State & { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not load connections");
      return data;
    },
  });
  const data = query.data;
  const destination = data?.destinations.find(
    (d) => `${d.connectionId}:${d.accountId}` === destinationKey,
  );
  async function save() {
    if (!destination) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: clientId,
          connectionId: destination.connectionId,
          accountId: destination.accountId,
          pageId,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        pixel?: Awaited<ReturnType<typeof saveSharedAdsConnection>>["pixel"];
      };
      if (!response.ok) throw new Error(result.error ?? "Could not save");
      await queryClient.invalidateQueries({
        queryKey: ["shared-ads-connections", brandId],
      });
      const pixel = result.pixel;
      setMessage(
        `Saved. This brand’s ads use the selected Page and ad account. ${
          !pixel
            ? ""
            : "error" in pixel
              ? `Pixel setup stopped: ${pixel.error}`
              : pixel.pendingChoice
                ? "Several pixels exist; confirm one in the brand’s tasks."
                : `Pixel ${pixel.pixelId}${pixel.created ? " was created in the client’s ad account" : " is the default"}.`
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Performance ads connections</h2>
        <Button variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Collapse" : "Manage"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Run client ads through a managing brand’s connection. Each client keeps
        its own Facebook Page; organic posting stays separate.
      </p>
      {open && (
        <>
          {query.isPending && (
            <p className="text-sm">Checking connected Pages and ad accounts…</p>
          )}
          {query.error && <p role="alert">{query.error.message}</p>}
          {data?.managingBrandId && (
            <p className="text-sm">
              Ads managed through{" "}
              <Link
                className="underline"
                href={`/app/performance/clients/${data.managingBrandSlug}/settings`}
              >
                {data.managingBrandName}
              </Link>{" "}
              · Facebook Page {data.pageId}
            </p>
          )}
          {data?.brands
            .filter((b) => b.managed)
            .map((b) => (
              <p key={b.id} className="text-sm">
                <strong>{b.name}</strong> · Page {b.pageId} ·{" "}
                {b.accountIds
                  .map(
                    (id) =>
                      data.destinations.find((d) => d.accountId === id)?.name ??
                      id,
                  )
                  .join(", ")}
              </p>
            ))}
          {data && !data.destinations.length && !data.managingBrandId && (
            <p className="text-sm">
              No Meta ads connection on this brand. Configure shared access from
              the managing brand’s settings, or connect this brand directly.
            </p>
          )}
          {!!data?.destinations.length && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
                <label className="space-y-1 text-sm">
                  Client brand
                  <select
                    className="block w-full rounded-md border bg-background p-2"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setPageId(
                        data.brands.find((b) => b.id === e.target.value)
                          ?.pageId ?? "",
                      );
                    }}
                  >
                    <option value="">Choose brand</option>
                    {data.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Paying ad account
                  <select
                    className="block w-full rounded-md border bg-background p-2"
                    value={destinationKey}
                    onChange={(e) => setDestinationKey(e.target.value)}
                  >
                    <option value="">Choose account</option>
                    {data.destinations.map((d) => (
                      <option
                        key={`${d.connectionId}:${d.accountId}`}
                        value={`${d.connectionId}:${d.accountId}`}
                      >
                        {d.name} · {d.accountId}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Client Facebook Page
                  <select
                    className="block w-full rounded-md border bg-background p-2"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                  >
                    <option value="">Choose Page</option>
                    {destination?.pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                disabled={
                  busy ||
                  !clientId ||
                  !destination?.pages.some((p) => p.id === pageId)
                }
                onClick={save}
              >
                {busy ? "Saving…" : "Save shared access"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Allows this ad account for the client. Does not publish ads or
                change the connection’s default Page.
              </p>
            </div>
          )}
          {data && !!data.destinations.length && (
            <TrackingDefaults
              brandId={brandId}
              destinations={data.destinations}
              defaults={data.trackingDefaults}
            />
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
