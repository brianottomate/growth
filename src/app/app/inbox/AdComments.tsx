import { isZernioConfigured } from "@/server/clients/zernio.client";

import { ListenItemActions } from "@/components/listening/ListenItemActions";
import {
  buildAdCommentContext,
  commentTimeMs,
  getRecentAdComments,
  LISTENING_WINDOW_DAYS,
} from "./zernio-listening";

export async function AdComments() {
  if (!isZernioConfigured) return null;

  let result: Awaited<ReturnType<typeof getRecentAdComments>>;
  try {
    result = await getRecentAdComments();
  } catch (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Failed to fetch ad comments</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <p className="mt-2 text-xs">
          Probably <code className="font-mono">GET /v1/ads/tree</code> failing —
          verify the ad account is wired up in Zernio.
        </p>
      </div>
    );
  }

  const sorted = [...result.comments].sort(
    (a, b) => (commentTimeMs(b) ?? 0) - (commentTimeMs(a) ?? 0),
  );
  const top = sorted.slice(0, 50);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="font-mono">{result.totalAds}</span> ads ·{" "}
        <span className="font-mono">{result.adsWithComments}</span> with comments
        ·{" "}
        <span className="font-mono">{result.comments.length}</span> comment
        {result.comments.length === 1 ? "" : "s"} in the last{" "}
        {LISTENING_WINDOW_DAYS} days ·{" "}
        <span className="font-mono">{result.errors.length}</span> error
        {result.errors.length === 1 ? "" : "s"}
      </p>

      {result.errors.length > 0 ? (
        <details className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold">
            {result.errors.length} ad{result.errors.length === 1 ? "" : "s"}{" "}
            errored (likely Stories / DPA — not commentable)
          </summary>
          <ul className="mt-2 space-y-1">
            {result.errors.slice(0, 10).map((err, i) => (
              <li key={`${err.adId}-${i}`} className="font-mono">
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
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No ad comments in the last {LISTENING_WINDOW_DAYS} days. Either no
          active ads drew comments recently, or the ad account isn&apos;t
          connected in Zernio.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {top.map((c, idx) => {
            const id = c.id ?? c._id ?? `idx-${idx}`;
            const author = c.from?.name ?? "Unknown";
            const body = (c.message ?? c.content ?? "").trim();
            const short = body.length > 280 ? `${body.slice(0, 280)}…` : body;
            const when = commentTimeMs(c);
            return (
              <li key={String(id)} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {author}
                      </span>
                      {when ? (
                        <span className="text-xs text-muted-foreground">
                          · {new Date(when).toLocaleDateString()}
                        </span>
                      ) : null}
                      {c.parent ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          reply
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
                      {short || (
                        <span className="text-muted-foreground italic">
                          (no text)
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        on ad:{" "}
                        {c.adUrl ? (
                          <a
                            href={c.adUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-foreground hover:text-primary hover:underline"
                          >
                            {c.adName ?? c.adId} ↗
                          </a>
                        ) : (
                          <span className="text-foreground">
                            {c.adName ?? c.adId}
                          </span>
                        )}
                      </span>
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline"
                        >
                          open comment ↗
                        </a>
                      ) : null}
                    </div>
                    <ListenItemActions context={buildAdCommentContext(c)} />
                  </div>
                  <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
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
