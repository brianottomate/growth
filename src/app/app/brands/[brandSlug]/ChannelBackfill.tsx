"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import type {
  ChannelBackfillPost,
  ChannelBackfillState,
} from "@/server/services/peer-scrape.service";
import { CompactPlatformPreview } from "@/app/app/content/[contentId]/CompactPlatformPreview";

type ScrapePlatform = "instagram" | "facebook" | "linkedin" | "x";

/** Sample sizes an operator picks from. Small first: scraping bills per record. */
const PULLS: {
  label: string;
  limit: number;
  sinceDays: number;
  title: string;
}[] = [
  {
    label: "Sample 5",
    limit: 5,
    sinceDays: 93,
    title: "Five most recent posts — confirms the channel is wired up",
  },
  {
    label: "30 days",
    limit: 30,
    sinceDays: 30,
    title: "Up to 30 posts from the last month",
  },
  {
    label: "90 days",
    limit: 100,
    sinceDays: 93,
    title: "Up to 100 posts from the last three months",
  },
];

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Footer for one channel gauge: the newest pulled posts as platform previews
 * (the same card the content page uses), what is in the store for this
 * platform, the latest run's outcome, and the on-demand pull controls. This
 * is the operator's "did the backfill work?" readout, not a content view —
 * the timeline and calendar show everything.
 */
export function ChannelBackfill({
  brandId,
  brandName,
  state,
}: {
  brandId: string;
  brandName: string;
  state: ChannelBackfillState;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);

  const scrape = useMutation(
    orpc.channelSuggestion.scrapePosts.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          `${labelFor(state.platform)} · ${r.inserted} new, ${r.updatedExisting} refreshed via ${r.provider}`,
        );
        setRunning(null);
        router.refresh();
      },
      onError: (e) => {
        toast.error(e.message);
        setRunning(null);
        router.refresh();
      },
    }),
  );

  const run = (p: (typeof PULLS)[number]) => {
    setRunning(p.label);
    scrape.mutate({
      brandId,
      platform: state.platform as ScrapePlatform,
      limit: p.limit,
      sinceDays: p.sinceDays,
    });
  };

  const last = state.lastRun;
  const facts: string[] = [];
  facts.push(
    state.posts > 0
      ? `${state.posts} post${state.posts === 1 ? "" : "s"} in store`
      : "Nothing pulled yet",
  );
  if (state.lastScrapedAt)
    facts.push(`last pulled ${dateFmt.format(new Date(state.lastScrapedAt))}`);

  return (
    <>
      {state.recentPosts.length > 0 && (
        <div className="border-t px-4 pt-3 pb-1">
          <div className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Latest pulled · {state.recentPosts.length} of {state.posts}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {state.recentPosts.map((post) => (
              <PulledPost
                key={post.id}
                post={post}
                platform={state.platform}
                brandName={brandName}
                handle={state.handle}
                profileImageUrl={state.profileImageUrl}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {facts.join(" · ")}
        </span>

        {last && (
          <span
            className={`text-[11px] ${
              last.status === "failed"
                ? "text-destructive"
                : last.status === "running"
                  ? "text-amber-500"
                  : "text-muted-foreground"
            }`}
            title={last.error ?? undefined}
          >
            {last.status === "failed"
              ? `run failed ${timeFmt.format(new Date(last.startedAt))}${last.error ? ` — ${last.error.slice(0, 80)}` : ""}`
              : last.status === "running"
                ? `run in progress since ${timeFmt.format(new Date(last.startedAt))}`
                : `last run ${timeFmt.format(new Date(last.startedAt))} · ${last.inserted ?? 0} new${last.limit ? ` of ${last.limit} asked` : ""} · ${last.provider}`}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          {state.scrapable ? (
            PULLS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                tone="muted"
                textSize="caption"
                density="tight"
                className="h-6"
                title={p.title}
                disabled={running != null}
                loading={running === p.label}
                onClick={() => run(p)}
              >
                {p.label}
              </Button>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {state.profileUrl
                ? `No scraper for ${labelFor(state.platform)} yet`
                : "Add the page link to enable pulls"}
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/** One pulled post in the content page's preview card, linking to the original. */
function PulledPost({
  post,
  platform,
  brandName,
  handle,
  profileImageUrl,
}: {
  post: ChannelBackfillPost;
  platform: string;
  brandName: string;
  handle: string | null;
  profileImageUrl: string | null;
}) {
  const parts: string[] = [];
  if (post.publishedAt) parts.push(dateFmt.format(new Date(post.publishedAt)));
  const s = post.stats;
  if (s?.likes != null) parts.push(`${compactFmt.format(s.likes)} likes`);
  if (s?.comments != null)
    parts.push(`${compactFmt.format(s.comments)} comments`);
  if (s?.views != null) parts.push(`${compactFmt.format(s.views)} views`);

  const card = (
    <CompactPlatformPreview
      className="w-52 max-w-52 shrink-0"
      platform={platform}
      format={null}
      channelName={handle ?? post.username}
      channelProfileImageUrl={profileImageUrl}
      username={post.username ?? handle}
      brandName={brandName}
      contentTitle={post.text?.slice(0, 60) ?? "Pulled post"}
      text={post.text ?? ""}
      media={post.media}
      scheduled
      readiness={false}
      caption={parts.join(" · ") || "pulled"}
    />
  );

  return post.externalUrl ? (
    <a
      href={post.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the original post"
      className="shrink-0 rounded-xl transition-opacity hover:opacity-90"
    >
      {card}
    </a>
  ) : (
    card
  );
}

function labelFor(platform: string) {
  return (
    {
      instagram: "Instagram",
      facebook: "Facebook",
      linkedin: "LinkedIn",
      x: "X",
      youtube: "YouTube",
      tiktok: "TikTok",
    }[platform] ?? platform
  );
}
