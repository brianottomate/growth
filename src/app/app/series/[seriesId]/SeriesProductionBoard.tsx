"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaAssetView } from "@/components/media-asset-view";
import { AddIdeaDrawer } from "@/app/app/content/AddIdeaDrawer";
import { CompactPlatformPreview } from "@/app/app/content/[contentId]/CompactPlatformPreview";
import type { MediaItem } from "@/server/db/schema";

type Post = {
  id: string;
  title: string | null;
  status: string;
  plannedAt: Date | null;
  hook: string | null;
  media: MediaItem[] | null;
  platformPosts: {
    id: string;
    platform: string;
    format: string | null;
    parentPlatformPostId: string | null;
    status: string;
    text: string | null;
    media: MediaItem[] | null;
  }[];
};
export function SeriesProductionBoard({
  posts,
  seriesId,
  brand,
  children,
}: {
  posts: Post[];
  seriesId: string;
  brand: { id: string; name: string; slug: string | null };
  children: ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["production", "calendar"] as const).withDefault(
      "production",
    ),
  );
  const [filter, setFilter] = useQueryState(
    "stage",
    parseAsStringLiteral([
      "all",
      "draft",
      "review",
      "ready",
      "published",
    ] as const).withDefault("all"),
  );
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const brands = useMemo(() => [brand], [brand]);
  const visible = posts.filter((post) => {
    const matches =
      filter === "all" ||
      (filter === "draft" && ["slot", "draft"].includes(post.status)) ||
      (filter === "review" && post.status === "pending_review") ||
      (filter === "ready" && ["approved", "scheduled"].includes(post.status)) ||
      (filter === "published" && post.status === "published");
    return (
      matches &&
      `${post.title ?? ""} ${post.hook ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">
          Installments · {posts.length}
        </h2>
        {(["production", "calendar"] as const).map((mode) => (
          <Button
            key={mode}
            variant={view === mode ? "secondary" : "ghost"}
            aria-pressed={view === mode}
            onClick={() => void setView(mode)}
          >
            {mode === "production" ? "Production" : "Calendar context"}
          </Button>
        ))}
        <Button onClick={() => setAdding(true)}>Add installment</Button>
      </div>
      {view === "calendar" ? (
        children
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(["all", "draft", "review", "ready", "published"] as const).map(
              (stage) => (
                <Button
                  key={stage}
                  size="sm"
                  className="h-11 @xl:h-8"
                  variant={filter === stage ? "secondary" : "ghost"}
                  aria-pressed={filter === stage}
                  onClick={() => void setFilter(stage)}
                >
                  {stage === "all"
                    ? "All"
                    : stage === "draft"
                      ? "Drafts"
                      : stage === "review"
                        ? "In review"
                        : stage === "ready"
                          ? "Approved / scheduled"
                          : "Published"}
                </Button>
              ),
            )}
            <Input
              className="h-11 w-full @xl:ml-auto @xl:h-9 @xl:w-60"
              aria-label="Search installments"
              placeholder="Search installments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {visible.map((post) => (
              <Installment key={post.id} post={post} brandName={brand.name} />
            ))}
          </div>
          {!visible.length && (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              {posts.length
                ? "No installments match this view."
                : "Add the first installment to begin production."}
            </p>
          )}
        </>
      )}
      <AddIdeaDrawer
        brands={brands}
        defaultBrandId={brand.id}
        defaultSeriesId={seriesId}
        open={adding}
        onOpenChange={setAdding}
        onCreated={() => router.refresh()}
      />
    </section>
  );
}
function Installment({ post, brandName }: { post: Post; brandName: string }) {
  const roots = post.platformPosts.filter((spot) => !spot.parentPlatformPostId);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const spot = roots.find((item) => item.id === channelId) ?? roots[0];
  const media = spot?.media?.length ? spot.media : (post.media ?? []);
  const active = Math.min(index, Math.max(0, media.length - 1));
  const item = media[active];
  return (
    <article className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {post.plannedAt
            ? new Date(post.plannedAt).toLocaleDateString()
            : "Undated"}
        </span>
        <span>{post.status.replaceAll("_", " ")}</span>
      </div>
      <h3 className="font-medium [overflow-wrap:anywhere]">
        <Link href={`/app/content/${post.id}`} className="hover:underline">
          {post.title ?? "Untitled"}
        </Link>
      </h3>
      <div className="flex flex-wrap gap-1">
        {roots.map((channel) => (
          <Button
            size="sm"
            key={channel.id}
            aria-pressed={spot?.id === channel.id}
            variant={spot?.id === channel.id ? "secondary" : "ghost"}
            onClick={() => {
              setChannelId(channel.id);
              setIndex(0);
            }}
          >
            {channel.platform} · {channel.status.replaceAll("_", " ")}
          </Button>
        ))}
      </div>
      {item ? (
        <div className="aspect-square">
          <MediaAssetView
            item={item}
            label={`${post.title ?? "Installment"} media ${active + 1}`}
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          Media has not been added.
        </div>
      )}
      {media.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            aria-label="Previous media"
            onClick={() => setIndex((active - 1 + media.length) % media.length)}
          >
            Previous
          </Button>
          <span className="text-xs">
            {active + 1} / {media.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="Next media"
            onClick={() => setIndex((active + 1) % media.length)}
          >
            Next
          </Button>
        </div>
      )}
      <p className="line-clamp-5 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
        {spot?.text || post.hook || "Copy has not been added."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/app/content/${post.id}`}>Edit installment</Link>
        </Button>
        {spot && (
          <Button
            variant="ghost"
            aria-expanded={preview}
            onClick={() => setPreview(!preview)}
          >
            Platform preview
          </Button>
        )}
      </div>
      {preview && spot && (
        <CompactPlatformPreview
          platform={spot.platform}
          format={spot.format}
          channelName={null}
          username={null}
          brandName={brandName}
          contentTitle={post.title ?? "Untitled"}
          text={spot.text ?? ""}
          media={media}
          scheduled={spot.status === "scheduled"}
        />
      )}
    </article>
  );
}
