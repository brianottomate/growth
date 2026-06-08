import {
  isZernioConfigured,
  listAllZernioAdsWithComments,
} from "@/server/clients/zernio.client";
import { constructMetadata } from "@/lib/metadata";

import { AdsGridClient } from "./AdsGridClient";

export const metadata = constructMetadata({
  title: "Ads",
  eyebrow: "Zernio",
  path: "/zernio/ads",
  description: "Historical feed of all Wander ads — creatives + comments.",
});

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type StatusFilter = "active" | "non-paused" | "all";

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "active", label: "Active only" },
  { key: "non-paused", label: "Non-paused" },
  { key: "all", label: "All" },
];

function resolveFilter(raw: string | undefined): StatusFilter {
  if (raw === "active" || raw === "all" || raw === "non-paused") return raw;
  return "non-paused";
}

export default async function ZernioAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp.status);

  return (
    <div className="bg-white px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-rose-600 uppercase">
            Historical feed
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Ads
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Every ad in the connected Meta ad account with creative thumbnails
            and live comments. Slow load by design — fans out{" "}
            <code className="font-mono text-sm">
              GET /v1/ads/&#123;id&#125;/comments
            </code>{" "}
            per ad in parallel.
          </p>
        </header>

        <FilterPills current={filter} />
        <AdsSection filter={filter} />
      </div>
    </div>
  );
}

function FilterPills({ current }: { current: StatusFilter }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const isActive = f.key === current;
        return (
          <a
            key={f.key}
            href={`?status=${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              isActive
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </a>
        );
      })}
    </div>
  );
}

async function AdsSection({ filter }: { filter: StatusFilter }) {
  if (!isZernioConfigured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <code className="font-mono">ZERNIO_API_KEY</code> is not set.
      </div>
    );
  }

  // Per Zernio docs (https://docs.zernio.com/ad-campaigns/get-ad-tree),
  // ad-level status enum is just: "active" | "paused".
  const includeOnly = filter === "active" ? ["active"] : undefined;
  const exclude = filter === "non-paused" ? ["paused"] : [];

  let result: Awaited<ReturnType<typeof listAllZernioAdsWithComments>>;
  try {
    result = await listAllZernioAdsWithComments({
      maxAds: 500,
      perAdLimit: 25,
      excludeStatuses: exclude,
      includeOnlyStatuses: includeOnly,
    });
  } catch (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-semibold">Failed to fetch ads</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const sorted = [...result.ads].sort((a, b) => {
    const aTime = sortDate(a)?.getTime() ?? 0;
    const bTime = sortDate(b)?.getTime() ?? 0;
    return bTime - aTime;
  });

  const totalComments = sorted.reduce((n, a) => n + a.comments.length, 0);
  const commentErrors = sorted.filter((a) => a.commentError).length;

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <StatusDistribution counts={result.statusCounts} />
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No ads match this filter.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        <span className="font-mono">{result.campaignCount}</span> campaigns ·{" "}
        <span className="font-mono">{result.adSetCount}</span> ad sets ·{" "}
        <span className="font-mono">{result.totalAds}</span> total ads · showing{" "}
        <span className="font-mono">{sorted.length}</span> after filter
        {result.truncated
          ? ` (capped at ${sorted.length} of ${result.filteredCount})`
          : ""}{" "}
        · <span className="font-mono">{totalComments}</span> comment
        {totalComments === 1 ? "" : "s"} ·{" "}
        <span className="font-mono">{commentErrors}</span> non-commentable
      </p>

      <StatusDistribution counts={result.statusCounts} />

      <AdsGridClient ads={sorted} />
    </div>
  );
}

function StatusDistribution({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <span className="font-medium">Status distribution:</span>
      {entries.length === 0 ? (
        <span className="text-gray-400 italic">none</span>
      ) : (
        entries.map(([status, count]) => (
          <span
            key={status}
            className="rounded bg-gray-100 px-2 py-0.5 font-mono"
          >
            {status}: {count}
          </span>
        ))
      )}
    </div>
  );
}

function sortDate(ad: Record<string, unknown>): Date | null {
  const candidates = [
    "platformCreatedAt",
    "createdAt",
    "createdTime",
    "created_time",
  ];
  for (const key of candidates) {
    const v = ad[key];
    if (typeof v === "string") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}
