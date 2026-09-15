"use client";

import { Loader2 } from "lucide-react";

/**
 * What WanderOS is building right now, across every domain.
 *
 * A build runs 8–35 minutes on the monolith and its only delivery path is a
 * webhook, so the card you clicked from goes quiet the moment you leave it.
 * This strip answers "did my build take, and what else is running" — in one
 * line, because it sits above the whole leads surface and the earlier boxy
 * version shouted at everyone about plumbing (webhooks, stuck thresholds) that
 * only matters when something is actually wrong.
 *
 * The page owns the poll and passes rows in, so the cards can share the same
 * data without a second interval. Renders nothing when idle.
 */

export type InFlightBuild = {
  id: string;
  domain: string;
  status: string | null;
  requestedAt: string | Date;
  previewUrl: string | null;
};

/** "3m" / "1h 12m" since the build was asked for. Updates on the poll beat —
 * minute granularity doesn't need a ticker. */
export function elapsedLabel(since: string | Date): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Prod has legitimately taken 35 minutes on a heavy site, so the stuck hint
 * waits until well past that rather than crying wolf at the old ~18m note. */
export const STUCK_AFTER_MINUTES = 40;

export function isStuck(build: InFlightBuild): boolean {
  return (
    Date.now() - new Date(build.requestedAt).getTime() >
    STUCK_AFTER_MINUTES * 60_000
  );
}

export function PregenBuildsBanner({
  builds,
  onRefresh,
  refreshing,
}: {
  builds: InFlightBuild[];
  /** Re-read WanderOS for one build — the recovery for a lost webhook. */
  onRefresh?: (buildId: string) => void;
  refreshing?: string | null;
}) {
  if (!builds.length) return null;
  const anyStuck = builds.some(isStuck);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 font-medium">
        <Loader2 className="size-3.5 animate-spin" />
        {builds.length === 1 ? "Building" : `${builds.length} builds`}
      </span>
      {builds.map((build) => (
        <span
          key={build.id}
          className="flex items-center gap-1.5 text-muted-foreground"
        >
          <span className="text-foreground">{build.domain}</span>
          <span className="tabular-nums">
            {elapsedLabel(build.requestedAt)}
          </span>
          {/* The URL serves 200 from creation — it renders the page as it
              exists mid-flight, gallery last, so an early peek reads thin
              rather than unfinished. */}
          {build.previewUrl && (
            <a
              href={build.previewUrl}
              target="_blank"
              rel="noreferrer"
              title="Opens the page as it is right now — the gallery fills in last"
              className="underline underline-offset-2"
            >
              peek
            </a>
          )}
          {isStuck(build) && (
            <>
              <span className="text-amber-300">may be stuck</span>
              {onRefresh && (
                <button
                  onClick={() => onRefresh(build.id)}
                  disabled={refreshing === build.id}
                  className="underline underline-offset-2 disabled:opacity-50"
                >
                  {refreshing === build.id ? "refreshing…" : "refresh"}
                </button>
              )}
            </>
          )}
        </span>
      ))}
      {/* Plumbing talk only when it is actually relevant. */}
      {anyStuck && (
        <span className="text-[11px] text-muted-foreground">
          Builds settle over a webhook — one stuck past {STUCK_AFTER_MINUTES}m
          likely lost its event; refresh re-reads WanderOS directly.
        </span>
      )}
    </div>
  );
}
