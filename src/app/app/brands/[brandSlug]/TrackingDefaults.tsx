"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function TrackingDefaults({
  brandId,
  destinations,
  defaults,
}: {
  brandId: string;
  destinations: Array<{
    connectionId: string;
    accountId: string;
    name: string;
  }>;
  defaults: Record<string, { pixelId: string; customEventType: string }>;
}) {
  const [key, setKey] = useState("");
  const [pixel, setPixel] = useState("");
  const [event, setEvent] = useState("PURCHASE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  const destination = destinations.find(
    (d) => `${d.connectionId}:${d.accountId}` === key,
  );
  const url = `/api/performance/ads-connections/${brandId}`;
  const pixels = useQuery({
    queryKey: ["tracking-pixels", brandId, key],
    enabled: Boolean(destination),
    queryFn: async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trackingChoices", ...destination }),
      });
      const result = (await response.json()) as {
        pixels?: Array<{ id: string; name: string }>;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Could not load pixels");
      return result.pixels ?? [];
    },
  });
  async function save() {
    if (!destination) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trackingDefaults",
          ...destination,
          pixelId: pixel,
          customEventType: event.trim(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Could not save tracking defaults");
      await qc.invalidateQueries({
        queryKey: ["shared-ads-connections", brandId],
      });
      setMessage(
        "Saved. Campaigns using this account inherit these settings unless overridden.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">Default conversion tracking</h3>
      <p className="text-sm text-muted-foreground">
        Shared client campaigns inherit the pixel and event for their paying
        account. Campaign settings can override them.
      </p>
      <label className="block space-y-1 text-sm">
        Paying account for tracking
        <select
          className="block w-full rounded border bg-background p-2"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            const d = destinations.find(
              (d) => `${d.connectionId}:${d.accountId}` === e.target.value,
            );
            const saved = d ? defaults[d.accountId] : undefined;
            setPixel(saved?.pixelId ?? "");
            setEvent(saved?.customEventType ?? "PURCHASE");
            setMessage("");
          }}
        >
          <option value="">Choose account</option>
          {destinations.map((d) => (
            <option
              key={`${d.connectionId}:${d.accountId}`}
              value={`${d.connectionId}:${d.accountId}`}
            >
              {d.name}
            </option>
          ))}
        </select>
      </label>
      {destination && (
        <>
          <label className="block space-y-1 text-sm">
            Default pixel / dataset
            <select
              className="block w-full rounded border bg-background p-2"
              value={pixel}
              onChange={(e) => setPixel(e.target.value)}
            >
              <option value="">
                {pixels.isPending ? "Loading pixels…" : "Choose pixel"}
              </option>
              {pixels.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            Default conversion event
            <Input value={event} onChange={(e) => setEvent(e.target.value)} />
          </label>
          {pixels.error && <p role="alert">{pixels.error.message}</p>}
          <Button
            disabled={
              busy || !event.trim() || !pixels.data?.some((p) => p.id === pixel)
            }
            onClick={save}
          >
            {busy ? "Saving…" : "Save tracking defaults"}
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
