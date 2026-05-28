import {
  getZernioAnalytics,
  isZernioConfigured,
  type ZernioAnalyticsMetrics,
  type ZernioAnalyticsPost,
} from "@/server/clients/zernio.client";

const PLATFORMS = ["linkedin", "facebook"] as const;
const LOOKBACK_DAYS = 30;

export async function ZernioRecentActivity() {
  if (!isZernioConfigured) {
    return null;
  }

  const today = new Date();
  const from = new Date(today.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  const results = await Promise.all(
    PLATFORMS.map(async (platform) => {
      try {
        const posts = await getZernioAnalytics({ platform, fromDate, toDate });
        return { platform, posts, error: null as string | null };
      } catch (error) {
        return {
          platform,
          posts: [] as ZernioAnalyticsPost[],
          error:
            error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const errors: Array<{ platform: string; message: string }> = [];
  const allPosts: ZernioAnalyticsPost[] = [];

  for (const { platform, posts, error } of results) {
    if (error) {
      errors.push({ platform, message: error });
      continue;
    }
    for (const post of posts) {
      allPosts.push({ ...post, platform: post.platform ?? platform });
    }
  }

  allPosts.sort((a, b) => {
    const aTime = postDate(a)?.getTime() ?? 0;
    const bTime = postDate(b)?.getTime() ?? 0;
    return bTime - aTime;
  });

  const top = allPosts.slice(0, 20);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Window:{" "}
        <span className="font-mono">
          {fromDate} → {toDate}
        </span>{" "}
        ({LOOKBACK_DAYS} days)
      </p>

      {errors.map((err) => (
        <div
          key={err.platform}
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"
        >
          <span className="font-semibold">{err.platform}:</span>{" "}
          <span className="font-mono">{err.message}</span>
        </div>
      ))}

      {top.length === 0 && errors.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No activity in the last {LOOKBACK_DAYS} days.
        </div>
      ) : null}

      {top.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {top.map((post, idx) => {
            const id = post._id ?? post.id ?? post.postId ?? post.urn ?? idx;
            const when = postDate(post);
            const metrics = post.analytics ?? post.metrics ?? {};
            const snippet = (post.content ?? "").trim();
            const shortSnippet =
              snippet.length > 200 ? `${snippet.slice(0, 200)}…` : snippet;
            const link = post.url ?? post.permalink;
            return (
              <li key={String(id)} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm whitespace-pre-line text-gray-900">
                      {shortSnippet || (
                        <span className="text-gray-400 italic">
                          (no content)
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {when ? (
                        <time dateTime={when.toISOString()}>
                          {when.toLocaleDateString()}
                        </time>
                      ) : null}
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-rose-600 hover:underline"
                        >
                          open ↗
                        </a>
                      ) : null}
                    </div>
                    <Metrics metrics={metrics} />
                  </div>
                  <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                    {post.platform ?? "?"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Metrics({ metrics }: { metrics: ZernioAnalyticsMetrics }) {
  const entries: Array<[string, number]> = [];
  const keys: Array<keyof ZernioAnalyticsMetrics> = [
    "impressions",
    "reach",
    "views",
    "likes",
    "reactions",
    "comments",
    "shares",
    "clicks",
    "saves",
    "sends",
  ];
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number") {
      entries.push([String(key), value]);
    }
  }
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
      {entries.map(([key, value]) => (
        <span key={String(key)}>
          <span className="font-medium text-gray-900">{formatNum(value)}</span>{" "}
          {String(key)}
        </span>
      ))}
    </div>
  );
}

function postDate(post: ZernioAnalyticsPost): Date | null {
  const raw = post.publishedAt ?? post.postedAt ?? post.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
