"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SocialPostMock, type SocialMockMedia } from "@/components/social-mock";
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
  media: SocialMockMedia[];
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

type Brand = { name: string; logo: string | null };

const dayLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(iso))
    : "No date";

const shortDay = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
      }).format(new Date(iso))
    : "Not scheduled";

function SpotMock({
  spot,
  brand,
  plannedAt,
}: {
  spot: PreviewSpot;
  brand: Brand;
  plannedAt: string | null;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <ChannelLogo platform={spot.platform} className="size-3.5" />
        <span className="font-medium">{platformLabel(spot.platform)}</span>
        <span>· {spot.format?.split(".")[1] ?? "post"}</span>
        <span className="ml-auto capitalize">
          {spot.status.replace("_", " ")}
        </span>
      </div>
      <SocialPostMock
        post={{
          platform: spot.platform,
          format: spot.format,
          name: spot.channel.displayName ?? brand.name,
          handle: spot.channel.handle,
          avatars: [
            { url: spot.channel.profileImageUrl },
            { url: brand.logo, fit: "contain" },
          ],
          text: spot.text,
          media: spot.media,
          firstComment: spot.firstComment,
          meta: shortDay(spot.scheduledAt ?? plannedAt),
        }}
      />
    </div>
  );
}

function Picker({ ideas }: { ideas: PreviewIdea[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const all = () =>
    setChosen((current) =>
      current.length === ideas.length ? [] : ideas.map((idea) => idea.id),
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
  brand: Brand & { slug: string };
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
    <div className="mx-auto w-full max-w-7xl space-y-10 p-6">
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
        <div className="space-y-14">
          {ideas.map((idea) => (
            <section key={idea.id} className="space-y-4">
              <div className="space-y-1.5">
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
              </div>
              {/* One row per idea: every platform rendering side by side, stacking only on phones. */}
              <div
                className="grid items-start gap-6 max-sm:!grid-cols-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(Math.max(idea.spots.length, 1), 3)}, minmax(0, 1fr))`,
                }}
              >
                {idea.spots.map((spot) => (
                  <SpotMock
                    key={spot.id}
                    spot={spot}
                    brand={brand}
                    plannedAt={idea.plannedAt}
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
