"use client";

import { useState } from "react";

import type {
  AdWithComments,
  ZernioAdComment,
} from "@/server/clients/zernio.client";

type SortMode = "date" | "comments";

export function AdsGridClient({ ads }: { ads: AdWithComments[] }) {
  const [onlyWithComments, setOnlyWithComments] = useState(false);
  const [sort, setSort] = useState<SortMode>("date");

  const filtered = onlyWithComments
    ? ads.filter((a) => a.comments.length > 0)
    : ads;
  const withCommentsTotal = ads.filter((a) => a.comments.length > 0).length;

  const visible =
    sort === "comments"
      ? [...filtered].sort((a, b) => b.comments.length - a.comments.length)
      : filtered;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOnlyWithComments((v) => !v)}
          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
            onlyWithComments
              ? "border-rose-600 bg-rose-600 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          Only ads with comments ({withCommentsTotal})
        </button>

        <div className="flex items-center gap-1 rounded-full border border-gray-300 bg-white p-0.5">
          <span className="pl-2 text-xs text-gray-500">Sort:</span>
          <button
            type="button"
            onClick={() => setSort("date")}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              sort === "date"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Date
          </button>
          <button
            type="button"
            onClick={() => setSort("comments")}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              sort === "comments"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            Comments
          </button>
        </div>

        {onlyWithComments ? (
          <span className="text-xs text-gray-500">
            showing {visible.length} of {ads.length}
          </span>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No ads match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((ad, idx) => (
            <AdCard key={String(ad._id ?? ad.id ?? idx)} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdCard({ ad }: { ad: AdWithComments }) {
  const thumb = ad.creative?.thumbnailUrl ?? ad.creative?.imageUrl ?? null;
  const isVideo = Boolean(ad.creative?.videoUrl ?? ad.creative?.videoId);
  const when = adDate(ad);
  const body = ad.creative?.body?.trim() ?? "";
  const shortBody = body.length > 220 ? `${body.slice(0, 220)}…` : body;
  const m = (ad.metrics ?? {}) as Metrics;
  const currency = ad.currency ?? "USD";

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <Thumbnail
        url={thumb}
        isVideo={isVideo}
        permalink={ad.creative?.instagramPermalinkUrl ?? null}
        videoUrl={ad.creative?.videoUrl ?? null}
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {ad.name ?? "(no name)"}
            </h3>
            <StatusBadge status={ad.status ?? "unknown"} />
            {ad.platform ? (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                {ad.platform}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {ad.campaignName ?? "(no campaign)"}
            {when ? ` · ${when.toLocaleDateString()}` : ""}
          </p>
        </div>

        {shortBody ? (
          <p className="text-xs whitespace-pre-line text-gray-700">
            {shortBody}
          </p>
        ) : null}

        {ad.creative?.linkUrl ? (
          <a
            href={ad.creative.linkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate text-xs text-rose-600 hover:underline"
          >
            {ad.creative.linkUrl}
          </a>
        ) : null}

        <MetricsRow metrics={m} currency={currency} />

        <CommentsBlock comments={ad.comments} commentError={ad.commentError} />
      </div>
    </article>
  );
}

function Thumbnail({
  url,
  isVideo,
  permalink,
  videoUrl,
}: {
  url: string | null;
  isVideo: boolean;
  permalink: string | null;
  videoUrl: string | null;
}) {
  const openUrl = permalink ?? videoUrl ?? url;
  if (!url) {
    return (
      <div className="flex aspect-square items-center justify-center bg-gray-100 text-xs text-gray-400">
        no creative
      </div>
    );
  }
  const inner = (
    <>
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        src={url}
        alt=""
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
      {isVideo ? (
        <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          ▶ video
        </span>
      ) : null}
    </>
  );
  return openUrl ? (
    <a
      href={openUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="relative block"
    >
      {inner}
    </a>
  ) : (
    <div className="relative">{inner}</div>
  );
}

type Metrics = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  costPerConversion?: number;
  purchaseValue?: number;
  roas?: number;
};

function MetricsRow({
  metrics,
  currency,
}: {
  metrics: Metrics;
  currency: string;
}) {
  const has = (n: unknown): n is number => typeof n === "number" && n > 0;
  const items: Array<[string, string]> = [];
  if (has(metrics.spend))
    items.push([
      "spend",
      `${currencySymbol(currency)}${formatNum(metrics.spend, 2)}`,
    ]);
  if (has(metrics.impressions))
    items.push(["impr", formatNum(metrics.impressions)]);
  if (has(metrics.clicks)) items.push(["clicks", formatNum(metrics.clicks)]);
  if (has(metrics.ctr))
    items.push(["ctr", `${(metrics.ctr * 100).toFixed(2)}%`]);
  if (has(metrics.conversions))
    items.push(["conv", formatNum(metrics.conversions)]);
  if (has(metrics.roas)) items.push(["roas", `${metrics.roas.toFixed(2)}×`]);

  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">no spend / no data</p>;
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {items.map(([label, value]) => (
        <span key={label}>
          <span className="text-gray-500">{label}: </span>
          <span className="font-mono font-medium text-gray-900">{value}</span>
        </span>
      ))}
    </div>
  );
}

function CommentsBlock({
  comments,
  commentError,
}: {
  comments: ZernioAdComment[];
  commentError?: string;
}) {
  if (commentError) {
    const friendly = commentError.includes("ad_not_commentable")
      ? "not commentable"
      : commentError.length > 80
        ? `${commentError.slice(0, 80)}…`
        : commentError;
    return <p className="text-xs text-gray-400 italic">comments: {friendly}</p>;
  }
  if (comments.length === 0) {
    return <p className="text-xs text-gray-400 italic">no comments</p>;
  }

  const sorted = [...comments].sort((a, b) => {
    const aTime = commentTime(a)?.getTime() ?? 0;
    const bTime = commentTime(b)?.getTime() ?? 0;
    return bTime - aTime;
  });
  const preview = sorted.slice(0, 3);
  const remaining = sorted.length - preview.length;

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="mb-2 text-xs font-semibold text-gray-700">
        Comments ({sorted.length})
      </p>
      <ul className="space-y-2">
        {preview.map((c, idx) => (
          <CommentRow key={String(c.id ?? c._id ?? idx)} c={c} />
        ))}
      </ul>
      {remaining > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-rose-600 hover:underline">
            + {remaining} more
          </summary>
          <ul className="mt-2 space-y-2">
            {sorted.slice(3).map((c, idx) => (
              <CommentRow key={String(c.id ?? c._id ?? `m${idx}`)} c={c} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function CommentRow({ c }: { c: ZernioAdComment }) {
  const author = c.from?.name ?? "Unknown";
  const body = (c.message ?? c.content ?? "").trim();
  const short = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  const when = commentTime(c);
  return (
    <li className="text-xs">
      <span className="font-medium text-gray-900">{author}</span>
      {when ? (
        <span className="ml-1 text-gray-400">
          · {when.toLocaleDateString()}
        </span>
      ) : null}
      <p className="mt-0.5 whitespace-pre-line text-gray-700">
        {short || <span className="text-gray-400 italic">(no text)</span>}
      </p>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = (() => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-emerald-100 text-emerald-900";
      case "paused":
        return "bg-amber-100 text-amber-900";
      default:
        return "bg-gray-100 text-gray-700";
    }
  })();
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${color}`}>
      {status}
    </span>
  );
}

function adDate(ad: AdWithComments): Date | null {
  const candidates = [
    "platformCreatedAt",
    "createdAt",
    "createdTime",
    "created_time",
  ];
  for (const key of candidates) {
    const v = (ad as Record<string, unknown>)[key];
    if (typeof v === "string") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function commentTime(c: ZernioAdComment): Date | null {
  const raw = c.createdTime ?? c.created_time ?? c.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatNum(n: number, fractionDigits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    default:
      return "";
  }
}
