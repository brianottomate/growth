"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Group = RouterOutputs["content"]["groupingSuggestions"][number];

const KIND_CLS: Record<string, string> = {
  crosspost: "bg-sky-500/15 text-sky-300",
  series: "bg-violet-500/15 text-violet-300",
};

const SOCIAL = new Set([
  "instagram",
  "x",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "threads",
  "reddit",
  "pinterest",
]);
const EDITORIAL = new Set(["blog", "newsletter"]);

const hasSocial = (g: Group) => g.members.some((m) => SOCIAL.has(m.platform));
const hasEditorial = (g: Group) =>
  g.members.some((m) => EDITORIAL.has(m.platform));

type ContentFilter = "all" | "social" | "editorial";

const fmtD = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// First → last published date across a group's members (the series span).
function dateSpan(g: Group): { first: string; last: string } | null {
  const dates = g.members
    .map((m) => m.at)
    .filter((x): x is string => !!x)
    .sort();
  if (!dates.length) return null;
  return { first: dates[0]!, last: dates[dates.length - 1]! };
}

type Member = Group["members"][number];

const AMP_KINDS = new Set(["repost", "retweet", "quote"]);
const isAmp = (m: Member) => AMP_KINDS.has(m.externalKind ?? "");

/** A clickable post tile (grid layout). */
function MemberTile({ m }: { m: Member }) {
  const inner = (
    <>
      <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded">
        {m.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ChannelLogo
            platform={m.platform}
            className="m-auto mt-3 size-5 opacity-40"
          />
        )}
        <span className="absolute top-0.5 left-0.5 rounded bg-black/40 p-0.5 backdrop-blur-sm">
          <ChannelLogo platform={m.platform} className="size-3" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground flex items-center gap-1 text-[9px]">
          <span className="truncate">
            {platformLabel(m.platform)}
            {m.at ? ` · ${m.at.slice(0, 10)}` : ""}
          </span>
          {m.externalUrl && <span className="shrink-0">↗</span>}
        </div>
        <p className="line-clamp-3 text-[10px] leading-snug">{m.text}</p>
      </div>
    </>
  );
  const cls =
    "bg-muted/40 hover:border-foreground/40 flex w-44 gap-2 overflow-hidden rounded-lg border p-1.5 transition-colors";
  return m.externalUrl ? (
    <a
      href={m.externalUrl}
      target="_blank"
      rel="noreferrer"
      title="Open original post ↗"
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** One post rendered as a connected thread row (X-thread style). */
function ThreadRow({ m }: { m: Member }) {
  const inner = (
    <div className="flex items-start gap-2">
      <div className="bg-muted relative size-9 shrink-0 overflow-hidden rounded">
        {m.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ChannelLogo
            platform={m.platform}
            className="m-auto mt-2.5 size-4 opacity-40"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground flex items-center gap-1 text-[9px]">
          <ChannelLogo platform={m.platform} className="size-3" />
          {m.at ? m.at.slice(0, 10) : ""}
          {m.externalUrl && <span>↗</span>}
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug">{m.text}</p>
      </div>
    </div>
  );
  return m.externalUrl ? (
    <a
      href={m.externalUrl}
      target="_blank"
      rel="noreferrer"
      className="hover:bg-accent/40 -mx-1 block rounded px-1 py-1"
    >
      {inner}
    </a>
  ) : (
    <div className="py-1">{inner}</div>
  );
}

function GroupCard({
  g,
  onResolve,
  status,
}: {
  g: Group;
  onResolve: (id: string, accept: boolean) => void;
  status?: "accepted" | "rejected";
}) {
  const [showAmp, setShowAmp] = useState(false);
  const amps = g.members.filter(isAmp);
  const core = g.members.filter((m) => !isAmp(m));
  const coreSorted = [...core].sort((a, b) =>
    (a.at ?? "").localeCompare(b.at ?? ""),
  );
  // A real thread: 2+ core posts where one replies to another in the group.
  const isThread =
    core.length >= 2 &&
    core.some((m) => m.parentId && core.some((c) => c.id === m.parentId));

  return (
    <div
      className={`bg-card rounded-xl border p-4 transition-opacity ${status ? "opacity-55" : ""}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{g.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_CLS[g.groupKind] ?? "bg-muted text-muted-foreground"}`}
            >
              {g.groupKind}
            </span>
            <span
              className="text-muted-foreground text-[10px]"
              title={
                g.unit === "series"
                  ? "Accept → creates a series with one idea per post"
                  : "Accept → creates one content idea from these posts"
              }
            >
              → {g.unit === "series" ? "series" : "idea"}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {g.members.length} posts · {g.brandName}
            </span>
            {g.pillarSlug && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                {g.pillarSlug}
              </span>
            )}
            {(() => {
              const s = dateSpan(g);
              if (!s) return null;
              return (
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {s.first === s.last
                    ? fmtD(s.first)
                    : `${fmtD(s.first)} → ${fmtD(s.last)}`}
                </span>
              );
            })()}
          </div>
          {g.rationale && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {g.rationale}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status ? (
            <span
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                status === "accepted"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {status === "accepted" ? "✓ Accepted" : "✕ Rejected"}
            </span>
          ) : (
            <>
              <button
                onClick={() => onResolve(g.id, true)}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Accept
              </button>
              <button
                onClick={() => onResolve(g.id, false)}
                className="border-border text-muted-foreground hover:bg-accent rounded-md border px-2.5 py-1 text-xs font-medium"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {isThread ? (
          <div className="border-border/60 space-y-0.5 border-l-2 pl-3">
            <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              Thread · {core.length}
            </div>
            {coreSorted.map((m) => (
              <ThreadRow key={m.id} m={m} />
            ))}
          </div>
        ) : (
          core.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {coreSorted.map((m) => (
                <MemberTile key={m.id} m={m} />
              ))}
            </div>
          )
        )}

        {amps.length > 0 && (
          <div>
            <button
              onClick={() => setShowAmp((s) => !s)}
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              <span className="text-violet-400">
                ↻ {amps.length} amplification{amps.length > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground opacity-70">
                {showAmp ? "▲ hide" : "▼ show"}
              </span>
            </button>
            {showAmp && (
              <div className="mt-2 flex flex-wrap gap-2">
                {amps.map((m) => (
                  <MemberTile key={m.id} m={m} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function GroupingsClient() {
  const trpc = useTRPC();
  const opts = trpc.content.groupingSuggestions.queryOptions();
  const { data: groups = [], isLoading } = useQuery(opts);

  // Keep accepted/rejected rows in the list (just badge them) until reload, so
  // bulk review doesn't make items vanish/jump. Optimistic local state, no
  // refetch; revert on error.
  const [resolved, setResolved] = useState<
    Record<string, "accepted" | "rejected">
  >({});
  const resolve = useMutation(
    trpc.content.resolveGrouping.mutationOptions({
      onError: (_err, vars) =>
        setResolved((prev) => {
          const next = { ...prev };
          delete next[vars.id];
          return next;
        }),
    }),
  );
  const onResolve = (id: string, accept: boolean) => {
    setResolved((prev) => ({
      ...prev,
      [id]: accept ? "accepted" : "rejected",
    }));
    resolve.mutate({ id, accept });
  };

  const [filter, setFilter] = useState<ContentFilter>("all");
  const counts = useMemo(
    () => ({
      all: groups.length,
      social: groups.filter(hasSocial).length,
      editorial: groups.filter(hasEditorial).length,
    }),
    [groups],
  );
  const visible = useMemo(
    () =>
      groups.filter((g) =>
        filter === "social"
          ? hasSocial(g)
          : filter === "editorial"
            ? hasEditorial(g)
            : true,
      ),
    [groups, filter],
  );

  const FILTERS: { key: ContentFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "social", label: "Social" },
    { key: "editorial", label: "Blog & Newsletter" },
  ];

  // Session progress tally.
  const progress = useMemo(() => {
    const vals = Object.values(resolved);
    const accepted = vals.filter((v) => v === "accepted").length;
    const rejected = vals.filter((v) => v === "rejected").length;
    return {
      accepted,
      rejected,
      done: accepted + rejected,
      total: groups.length,
    };
  }, [resolved, groups.length]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Suggested groupings
        </h1>
        <Link
          href="/app/content"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Content board
        </Link>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        AI-proposed content ideas reconstructed from your posts. Accept to
        create the idea and link its posts; reject to dismiss.
      </p>

      <div className="mt-4 flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}{" "}
            <span className="tabular-nums opacity-60">{counts[f.key]}</span>
          </button>
        ))}
        <span className="flex-1" />
        {progress.done > 0 && (
          <span className="text-muted-foreground text-xs tabular-nums">
            <span className="text-emerald-400">{progress.accepted}</span>{" "}
            accepted
            {" · "}
            <span className="text-rose-400">{progress.rejected}</span> rejected
            {" · "}
            {progress.done}/{progress.total} done
          </span>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!isLoading && visible.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No groupings in this view.
          </p>
        )}
        {visible.map((g) => (
          <GroupCard
            key={g.id}
            g={g}
            status={resolved[g.id]}
            onResolve={onResolve}
          />
        ))}
      </div>
    </div>
  );
}
