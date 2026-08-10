"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useTRPC } from "@/trpc/react";

/**
 * What WanderOS is building right now, across every domain.
 *
 * A build runs ~18 minutes on the monolith and its only delivery path is a
 * webhook, so the card you clicked from goes quiet the moment you leave it and
 * nothing on the page says work is in progress. This is the one place that
 * answers "did my build take, and what else is running".
 *
 * Polls rather than subscribes: the webhook writes `settled_at`, and a 30s poll
 * over an indexed read of a tens-of-rows table is cheaper to own than a realtime
 * channel for something a human glances at. Renders nothing when idle, so it
 * costs no vertical space on the common path.
 */
export function PregenBuildsBanner() {
  const trpc = useTRPC();
  const builds = useQuery(
    trpc.leads.pregenBuildsInFlight.queryOptions(undefined, {
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),
  );

  const items = builds.data ?? [];
  if (!items.length) return null;

  return (
    <div className="border-border bg-muted/40 mb-4 rounded-lg border px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Loader2 className="size-3.5 animate-spin" />
        {items.length} preview {items.length === 1 ? "build" : "builds"} in
        progress
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((build) => (
          <li
            key={build.id}
            className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs"
          >
            <span className="text-foreground">{build.domain}</span>
            <span>{build.status ?? "requested"}</span>
            <span>· asked {new Date(build.requestedAt).toLocaleTimeString()}</span>
            {/* The URL is minted at creation and serves 200 immediately, so this
                link works long before the build is done — it just renders the
                site as it exists mid-flight. Measured on newyorkrentalbyowner
                .com while GENERATING: a real page and title, but 3 property
                cards against the 53–73 a settled preview carries, because the
                native flow builds the page first and the inventory pass fills
                the gallery after. Unlabelled, peeking early reads as a thin
                site rather than an unfinished one. */}
            {build.previewUrl ? (
              <a
                href={build.previewUrl}
                target="_blank"
                rel="noreferrer"
                title={
                  build.status === "READY"
                    ? "Open the finished preview"
                    : "Opens the page as it is RIGHT NOW — the gallery fills in last, so it will look thinner than the finished site"
                }
                className="underline underline-offset-2"
              >
                {build.status === "READY" ? "preview" : "peek · still filling in"}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {/* The webhook is the only thing that settles these. If one sits here long
          past ~18 minutes its event was probably dropped, and Refresh on the
          card is what re-reads WanderOS. */}
      <p className="text-muted-foreground mt-2 text-[11px]">
        Settled by webhook. A build stuck far past ~18 minutes likely lost its
        event — use Refresh on that prospect&apos;s card.
      </p>
    </div>
  );
}
