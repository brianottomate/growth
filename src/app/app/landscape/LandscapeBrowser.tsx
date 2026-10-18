"use client";
/* oxlint-disable nextjs/no-img-element -- imported social media has dynamic source URLs */
import { SaveReference } from "./SaveReference";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeerScrapeButton } from "../brands/PeerScrapeButton";
import type { MediaItem } from "@/server/db/schema";

type Brand = {
  id: string;
  name: string;
  role: string;
  slug: string | null;
  channels: { platform: string; profileUrl: string | null }[];
  posts: {
    id: string;
    text: string | null;
    platform: string;
    externalUrl: string | null;
    media: MediaItem[];
    at: string;
  }[];
};
function profileFor(brand: Brand) {
  const channel = brand.channels.find(
    (c) => c.platform === "instagram" && c.profileUrl,
  );
  if (!channel?.profileUrl) return null;
  try {
    const url = new URL(channel.profileUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      parts.length !== 1 ||
      !/^[a-zA-Z0-9_.]+$/.test(parts[0]!) ||
      ["p", "reel", "stories", "explore", "accounts", "direct"].includes(
        parts[0]!.toLowerCase(),
      )
    )
      return null;
    return `https://www.instagram.com/${parts[0]}/`;
  } catch {
    return null;
  }
}
export function LandscapeBrowser({ brands }: { brands: Brand[] }) {
  const [role, setRole] = useState("all");
  const [brandId, setBrandId] = useState("all");
  const visible = brands.filter(
    (b) =>
      (role === "all" || b.role === role) &&
      (brandId === "all" || b.id === brandId),
  );
  return (
    <div className="@container mx-auto w-full space-y-5 p-4 @xl:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Landscape</h1>
          <p className="text-sm text-muted-foreground">
            Browse your brand alongside competitors and creative references.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/landscape/boards">Reference boards</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/feed-v5">Open timeline</Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap gap-2">
        {["all", "owned", "competitor", "inspiration"].map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === role ? "secondary" : "ghost"}
            onClick={() => {
              setRole(r);
              setBrandId("all");
            }}
          >
            {r === "all"
              ? "All brands"
              : r === "owned"
                ? "Our brands"
                : r === "competitor"
                  ? "Competitors"
                  : "Inspiration"}
          </Button>
        ))}
        <select
          aria-label="Choose brand"
          className="max-w-full min-w-0 rounded-md border bg-background px-3 text-sm"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
        >
          <option value="all">Every brand</option>
          {brands
            .filter((b) => role === "all" || b.role === role)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </div>
      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles">Live profiles</TabsTrigger>
          <TabsTrigger value="posts">Imported posts</TabsTrigger>
        </TabsList>
        <TabsContent value="profiles">
          <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
            {visible.map((b) => {
              const profile = profileFor(b);
              return (
                <article
                  key={b.id}
                  className="min-w-0 overflow-hidden rounded-xl border"
                >
                  <header className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <h2 className="font-medium">{b.name}</h2>
                      <p className="text-xs text-muted-foreground">{b.role}</p>
                    </div>
                    {profile && (
                      <a
                        href={profile}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${b.name} on Instagram`}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </header>
                  {profile ? (
                    <iframe
                      src={`${profile}embed/`}
                      title={`${b.name} Instagram profile`}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="h-[500px] w-full border-0 bg-white"
                    />
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      Add an Instagram profile from Brands to preview it here.
                    </p>
                  )}
                  <footer className="border-t p-3">
                    <PeerScrapeButton brandId={b.id} channels={b.channels} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {b.posts.length} posts in this sample. Instagram controls
                      its live preview.
                    </p>
                  </footer>
                </article>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="posts">
          <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
            {visible.flatMap((b) =>
              b.posts.map((p) => (
                <article
                  key={p.id}
                  className="min-w-0 overflow-hidden rounded-xl border bg-card"
                >
                  <Link
                    href={`/app/feed-v5?post=${encodeURIComponent(p.id)}`}
                    className="block"
                  >
                    {p.media[0] &&
                    (p.media[0].thumbnail || p.media[0].type !== "video") ? (
                      <img
                        src={p.media[0].thumbnail ?? p.media[0].url}
                        alt={`${b.name} post`}
                        loading="lazy"
                        className="aspect-[4/5] w-full bg-muted object-contain"
                      />
                    ) : (
                      <div className="flex aspect-square items-center bg-muted p-4">
                        <p className="line-clamp-6 text-sm">
                          {p.text || "View post"}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1 p-3">
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.platform} · {new Date(p.at).toLocaleDateString()} ·{" "}
                        {p.media.length} media
                      </p>
                      <p className="line-clamp-3 text-xs">{p.text}</p>
                    </div>
                  </Link>
                  <div className="p-3 pt-0">
                    <SaveReference postId={p.id} />
                  </div>
                </article>
              )),
            )}
          </div>
          {visible.every((b) => !b.posts.length) && (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Import a recent sample from Live profiles to start browsing.
            </p>
          )}
        </TabsContent>
      </Tabs>
      {!visible.length && (
        <p className="p-8 text-center text-muted-foreground">
          Track reference brands from{" "}
          <Link className="underline" href="/app/brands">
            Brands
          </Link>
          .
        </p>
      )}
    </div>
  );
}
