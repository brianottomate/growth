"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";

export type PreviewSpot = {
  id: string;
  platform: string;
  format: string | null;
  status: string;
  text: string;
  firstComment: string | null;
  scheduledAt: string | null;
  media: {
    url: string;
    type: "image" | "video" | "carousel";
    thumbnail: string | null;
  }[];
  channel: {
    displayName: string | null;
    handle: string | null;
    profileImageUrl: string | null;
  };
};

export type PreviewIdea = {
  id: string;
  title: string;
  hook: string | null;
  pillar: string | null;
  status: string;
  plannedAt: string | null;
  spots: PreviewSpot[];
};

const dayLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(iso))
    : "No date";

function frameAspect(format: string | null) {
  if (format?.includes(".story") || format?.includes(".reel"))
    return "aspect-[9/16]";
  return "aspect-[4/5]";
}

function Frames({ spot }: { spot: PreviewSpot }) {
  const aspect = frameAspect(spot.format);
  if (spot.media.length === 0) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground flex w-full items-center justify-center text-xs",
          aspect,
        )}
      >
        No creative yet
      </div>
    );
  }
  if (spot.media.length === 1) {
    const item = spot.media[0]!;
    return (
      <div className={cn("bg-muted relative w-full overflow-hidden", aspect)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- library and provider hosts vary */}
        <img
          src={item.type === "video" ? (item.thumbnail ?? item.url) : item.url}
          alt=""
          className="size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="bg-muted flex snap-x snap-mandatory gap-1 overflow-x-auto">
      {spot.media.map((item, index) => (
        <div
          key={`${item.url}-${index}`}
          className={cn(
            "relative w-[88%] flex-none snap-center overflow-hidden",
            aspect,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- library and provider hosts vary */}
          <img
            src={
              item.type === "video" ? (item.thumbnail ?? item.url) : item.url
            }
            alt=""
            className="size-full object-cover"
          />
          <span className="absolute top-2 right-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
            {index + 1}/{spot.media.length}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Provider avatars carry signed, expiring URLs; fall back to the brand logo, then an initial. */
function Avatar({
  sources,
  initial,
}: {
  sources: (string | null)[];
  initial: string;
}) {
  const candidates = sources.filter((s): s is string => Boolean(s));
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  if (!src) {
    return (
      <span className="bg-muted flex size-8 items-center justify-center rounded-full text-xs font-semibold">
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- channel avatars live on provider hosts
    <img
      src={src}
      alt=""
      onError={() => setIndex((i) => i + 1)}
      className="bg-muted size-8 rounded-full border object-cover"
    />
  );
}

function SpotMock({
  spot,
  brandName,
  logo,
}: {
  spot: PreviewSpot;
  brandName: string;
  logo: string | null;
}) {
  const identity = spot.channel.displayName ?? brandName;
  const handle = spot.channel.handle
    ? `@${spot.channel.handle.replace(/^@/, "")}`
    : null;
  return (
    <article className="bg-background w-full max-w-sm overflow-hidden rounded-2xl border shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar
          sources={[spot.channel.profileImageUrl, logo]}
          initial={identity.slice(0, 1).toUpperCase()}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{identity}</div>
          <div className="text-muted-foreground truncate text-xs">
            {handle ?? platformLabel(spot.platform)}
          </div>
        </div>
        <ChannelLogo platform={spot.platform} className="size-4" />
      </header>
      <Frames spot={spot} />
      <div className="space-y-2 px-3 py-3">
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
          {spot.text.trim() || (
            <span className="text-muted-foreground italic">No copy yet.</span>
          )}
        </p>
        {spot.firstComment && (
          <p className="text-muted-foreground border-t pt-2 text-[11px] leading-relaxed">
            <span className="font-medium">First comment · </span>
            {spot.firstComment}
          </p>
        )}
      </div>
      <footer className="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-[11px]">
        <span className="capitalize">{spot.status.replace("_", " ")}</span>
        <span>
          {spot.format?.split(".")[1] ?? platformLabel(spot.platform)}
        </span>
      </footer>
    </article>
  );
}

function Picker({ ideas }: { ideas: PreviewIdea[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [chosen, setChosen] = useState<string[]>([]);
  const all = () =>
    setChosen((current) =>
      current.length === ideas.length ? [] : ideas.map((idea) => idea.id),
    );
  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border">
        {ideas.map((idea) => {
          const on = chosen.includes(idea.id);
          return (
            <li key={idea.id}>
              <button
                type="button"
                onClick={() => toggle(idea.id)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded border",
                    on && "bg-foreground text-background border-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="text-muted-foreground w-24 flex-none text-xs">
                  {dayLabel(idea.plannedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {idea.title}
                </span>
                <span className="text-muted-foreground flex-none text-xs">
                  {idea.spots
                    .map((spot) => platformLabel(spot.platform))
                    .join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
        {ideas.length === 0 && (
          <li className="text-muted-foreground px-4 py-6 text-sm">
            No planned ideas for this brand yet.
          </li>
        )}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          disabled={chosen.length === 0}
          onClick={() => router.push(`${pathname}?ids=${chosen.join(",")}`)}
        >
          Preview {chosen.length || ""} {chosen.length === 1 ? "idea" : "ideas"}
        </Button>
        {ideas.length > 0 && (
          <button
            type="button"
            onClick={all}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {chosen.length === ideas.length ? "Clear" : "Select all"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PreviewsClient({
  brand,
  ideas,
  picking,
}: {
  brand: { name: string; slug: string; logo: string | null };
  ideas: PreviewIdea[];
  picking: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const shareUrl = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}${pathname}?${search.toString()}`,
    [pathname, search],
  );
  const dated = ideas.filter((idea) => idea.plannedAt);
  const range =
    dated.length > 0
      ? `${dayLabel(dated[0]!.plannedAt)} to ${dayLabel(dated[dated.length - 1]!.plannedAt)}`
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {brand.name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {picking ? "Pick ideas to preview" : "Planned posts"}
          </h1>
          {!picking && (
            <p className="text-muted-foreground text-sm">
              {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}
              {range ? ` · ${range}` : ""}
            </p>
          )}
        </div>
        {!picking && (
          <div className="flex items-center gap-2">
            <Link
              href={pathname}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Change selection
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                toast.success("Link copied");
              }}
            >
              <Link2 className="size-4" />
              Copy link
            </Button>
          </div>
        )}
      </header>

      {picking ? (
        <Picker ideas={ideas} />
      ) : (
        <div className="space-y-12">
          {ideas.map((idea) => (
            <section key={idea.id} className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {dayLabel(idea.plannedAt)}
                </span>
                <h2 className="text-lg font-semibold">
                  <Link
                    href={`/app/content/${idea.id}`}
                    className="hover:underline"
                  >
                    {idea.title}
                  </Link>
                </h2>
                {idea.pillar && (
                  <span className="text-muted-foreground text-xs">
                    {idea.pillar}
                  </span>
                )}
              </div>
              {idea.hook && (
                <p className="text-muted-foreground max-w-3xl text-sm">
                  {idea.hook}
                </p>
              )}
              <div className="flex flex-wrap gap-5">
                {idea.spots.map((spot) => (
                  <SpotMock
                    key={spot.id}
                    spot={spot}
                    brandName={brand.name}
                    logo={brand.logo}
                  />
                ))}
                {idea.spots.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No platform posts yet.
                  </p>
                )}
              </div>
            </section>
          ))}
          {ideas.length === 0 && (
            <p className="text-muted-foreground text-sm">
              None of the requested ideas belong to this brand.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
