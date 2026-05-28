import {
  isZernioConfigured,
  listAllZernioAdComments,
  type AdCommentWithContext,
} from "@/server/clients/zernio.client";

export async function ZernioAdComments() {
  if (!isZernioConfigured) {
    return null;
  }

  let result: Awaited<ReturnType<typeof listAllZernioAdComments>>;
  try {
    result = await listAllZernioAdComments({ maxAds: 30, perAdLimit: 25 });
  } catch (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-semibold">Failed to fetch ad comments</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-2 text-xs">
          Probably <code className="font-mono">GET /v1/ads/tree</code> failing
          — verify the ad account is wired up in Zernio.
        </p>
      </div>
    );
  }

  const sorted = [...result.comments].sort((a, b) => {
    const aTime = commentTime(a)?.getTime() ?? 0;
    const bTime = commentTime(b)?.getTime() ?? 0;
    return bTime - aTime;
  });
  const top = sorted.slice(0, 50);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Scanned <span className="font-mono">{result.totalAds}</span> ad
        {result.totalAds === 1 ? "" : "s"} ·{" "}
        <span className="font-mono">{result.comments.length}</span> total
        comment{result.comments.length === 1 ? "" : "s"} ·{" "}
        <span className="font-mono">{result.errors.length}</span> error
        {result.errors.length === 1 ? "" : "s"}
      </p>

      {result.errors.length > 0 ? (
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <summary className="cursor-pointer font-semibold">
            {result.errors.length} ad{result.errors.length === 1 ? "" : "s"}{" "}
            errored (likely Stories / DPA — not commentable)
          </summary>
          <ul className="mt-2 space-y-1">
            {result.errors.slice(0, 10).map((err) => (
              <li key={err.adId} className="font-mono">
                {err.adName ?? err.adId}: {err.message}
              </li>
            ))}
            {result.errors.length > 10 ? (
              <li>+ {result.errors.length - 10} more…</li>
            ) : null}
          </ul>
        </details>
      ) : null}

      {top.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No ad comments returned. Either no active ads have comments, or the
          ad account isn&apos;t connected in Zernio.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {top.map((c, idx) => {
            const id = c.id ?? c._id ?? idx;
            const author = c.from?.name ?? "Unknown";
            const body = (c.message ?? c.content ?? "").trim();
            const short = body.length > 280 ? `${body.slice(0, 280)}…` : body;
            const when = commentTime(c);
            return (
              <li key={String(id)} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-gray-900">
                        {author}
                      </span>
                      {when ? (
                        <span className="text-xs text-gray-500">
                          · {when.toLocaleDateString()}
                        </span>
                      ) : null}
                      {c.parent ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                          reply
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-line text-gray-800">
                      {short || (
                        <span className="text-gray-400 italic">(no text)</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span>
                        on ad:{" "}
                        <span className="text-gray-700">
                          {c.adName ?? c.adId}
                        </span>
                      </span>
                      {c.permalink ? (
                        <a
                          href={c.permalink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-rose-600 hover:underline"
                        >
                          open ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                    {c.platform ?? "ads"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function commentTime(c: AdCommentWithContext): Date | null {
  const raw = c.createdTime ?? c.created_time ?? c.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
