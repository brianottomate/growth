"use client";

import { useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

/**
 * One post drawn the way its platform shows it. Organic previews (the brand
 * previews page, the content workbench) and ad previews (campaign dialog, the
 * Performance desk) all render through here, so a Facebook post looks like
 * Facebook everywhere and a change to the chrome lands once.
 */

export type SocialMockMedia = {
  url: string;
  /** Loose on purpose: call sites carry their own row types with `type?: string`. */
  type?: string | null;
  thumbnail?: string | null;
  width?: number | null;
  height?: number | null;
};

export type SocialMockAvatar = {
  url: string | null | undefined;
  /** A square profile photo covers; a wide brand lockup must be contained. */
  fit?: "cover" | "contain";
};

export type SocialMockAd = {
  headline: string | null;
  link: string | null;
  callToAction: string | null;
};

export type SocialMockPost = {
  platform: string;
  /** Concrete product when known; a `.story` or `.reel` format draws the vertical chrome. */
  format?: string | null;
  /** Page or account display name. */
  name: string;
  handle?: string | null;
  /** Fallback chain: provider avatars carry signed, expiring URLs. */
  avatars: SocialMockAvatar[];
  text: string | null;
  media: SocialMockMedia[];
  firstComment?: string | null;
  /** The line under the name: a date, "Just now", nothing. Ads show "Sponsored". */
  meta?: string | null;
  sponsored?: boolean;
  /** Present for an ad: the link card under the creative and the button. */
  ad?: SocialMockAd | null;
};

export type SocialMockCrop =
  "auto" | "square" | "portrait" | "landscape" | "story";

const CROP_CLASS: Record<Exclude<SocialMockCrop, "auto">, string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  landscape: "aspect-[1.91/1]",
  story: "aspect-[9/16]",
};

export const ctaLabel = (cta: string | null | undefined) =>
  cta
    ? cta
        .toLowerCase()
        .split("_")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ")
    : "Learn more";

export const domainOf = (url: string | null | undefined) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "";
  }
};

export const isVerticalFormat = (format: string | null | undefined) =>
  Boolean(format && (format.includes(".story") || format.includes(".reel")));

/** Feed crop from the first frame: portrait uploads show 4:5, landscape 1.91:1, the rest square. */
function autoCrop(media: SocialMockMedia[], platform: string) {
  const first = media[0];
  if (first?.width && first?.height) {
    const ratio = first.height / first.width;
    if (ratio > 1.1) return CROP_CLASS.portrait;
    if (ratio < 0.8 && platform !== "instagram") return CROP_CLASS.landscape;
  }
  return CROP_CLASS.square;
}

function cropClass(
  crop: SocialMockCrop,
  media: SocialMockMedia[],
  platform: string,
) {
  return crop === "auto" ? autoCrop(media, platform) : CROP_CLASS[crop];
}

const isVideo = (item: SocialMockMedia | undefined) => item?.type === "video";

export function Avatar({
  sources,
  initial,
  className,
}: {
  sources: SocialMockAvatar[];
  initial: string;
  className?: string;
}) {
  const candidates = sources.filter(
    (s): s is SocialMockAvatar & { url: string } => Boolean(s.url),
  );
  const [index, setIndex] = useState(0);
  const current = candidates[index];
  if (!current) {
    return (
      <span
        className={cn(
          "grid place-items-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700",
          className,
        )}
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- avatars live on provider hosts
    <img
      src={current.url}
      alt=""
      onError={() => setIndex((i) => i + 1)}
      className={cn(
        "rounded-full border border-black/5 bg-white",
        current.fit === "contain" ? "object-contain p-0.5" : "object-cover",
        className,
      )}
    />
  );
}

/** A frame of media. Video plays in place (this is where an operator checks it); a poster stands in when it cannot. */
function Frame({ item, play }: { item: SocialMockMedia; play: boolean }) {
  // Absolutely positioned inside a fill wrapper: the image's intrinsic size
  // then never drives a grid track, so a layout's aspect box is the truth.
  const fill = "absolute inset-0 size-full object-cover";
  let inner: React.ReactNode;
  if (isVideo(item)) {
    const poster =
      item.thumbnail && item.thumbnail !== item.url
        ? item.thumbnail
        : undefined;
    inner = play ? (
      <video
        src={item.url}
        poster={poster}
        className={cn(fill, "bg-black")}
        controls
        playsInline
        preload="metadata"
      />
    ) : poster ? (
      // eslint-disable-next-line @next/next/no-img-element -- library and provider hosts vary
      <img src={poster} alt="" className={fill} />
    ) : (
      <div className={cn(fill, "grid place-items-center bg-neutral-900")}>
        <span className="grid size-10 place-items-center rounded-full bg-white/90 text-black">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
      </div>
    );
  } else {
    inner = (
      // eslint-disable-next-line @next/next/no-img-element -- library and provider hosts vary
      <img src={item.url} alt="" className={fill} />
    );
  }
  return <div className="relative size-full min-h-0 min-w-0">{inner}</div>;
}

/** One frame at a time with arrows, dots and the 1/N pill. Controlled when `onCard` is given. */
export function Carousel({
  media,
  crop,
  card,
  onCard,
  play,
  children,
}: {
  media: SocialMockMedia[];
  crop: string;
  card?: number;
  onCard?: (next: number) => void;
  play: boolean;
  children?: React.ReactNode;
}) {
  const [internal, setInternal] = useState(0);
  const index = Math.min(card ?? internal, Math.max(media.length - 1, 0));
  const go = (next: number) => (onCard ?? setInternal)(next);
  const item = media[index];
  const many = media.length > 1;
  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden bg-neutral-100",
        crop,
      )}
    >
      {item ? (
        <Frame item={item} play={play} />
      ) : (
        <div className="grid size-full place-items-center text-xs text-neutral-400">
          No creative yet
        </div>
      )}
      {many && (
        <>
          <span className="absolute top-3 right-3 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
            {index + 1}/{media.length}
          </span>
          <button
            type="button"
            aria-label="Previous"
            disabled={index === 0}
            onClick={() => go(Math.max(0, index - 1))}
            className="absolute top-1/2 left-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow disabled:hidden"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            disabled={index === media.length - 1}
            onClick={() => go(Math.min(media.length - 1, index + 1))}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow disabled:hidden"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-2 left-0 flex w-full justify-center gap-1">
            {media.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Frame ${i + 1}`}
                onClick={() => go(i)}
                className={cn(
                  "size-1.5 rounded-full",
                  i === index ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/**
 * Facebook multi-photo layout. A landscape lead gets one photo over a row.
 * A portrait lead is drawn large on the left at its own 4:5 with the rest
 * stacked beside it, the way Facebook keeps a portrait creative whole; that
 * matters here because composed cards carry their copy in the image.
 */
function FacebookPhotos({
  media,
  crop,
  play,
}: {
  media: SocialMockMedia[];
  crop: string;
  play: boolean;
}) {
  const n = media.length;
  const frame = (i: number) => <Frame key={i} item={media[i]!} play={play} />;
  const more = (i: number, rest: number) => (
    <div key={i} className="relative">
      {frame(i)}
      {rest > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-semibold text-white">
          +{rest}
        </span>
      )}
    </div>
  );
  if (n <= 1) {
    return (
      <div className={cn("w-full overflow-hidden bg-neutral-100", crop)}>
        {n === 1 ? (
          frame(0)
        ) : (
          <div className="grid size-full place-items-center text-xs text-neutral-400">
            No creative yet
          </div>
        )}
      </div>
    );
  }
  const lead = media[0]!;
  const portrait = Boolean(
    lead.width && lead.height && lead.height / lead.width > 1.1,
  );
  if (portrait) {
    if (n === 2) {
      return (
        <div className="grid aspect-[8/5] min-h-0 grid-cols-2 grid-rows-1 gap-0.5 bg-black">
          {frame(0)}
          {frame(1)}
        </div>
      );
    }
    // 4:3 over 3fr:2fr columns leaves the left cell at exactly 4:5.
    const side = Math.min(n - 1, 3);
    const rest = n - 1 - side;
    return (
      <div className="grid aspect-[4/3] min-h-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] grid-rows-1 gap-0.5 bg-black">
        {frame(0)}
        <div
          className="grid min-h-0 gap-0.5"
          style={{ gridTemplateRows: `repeat(${side}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: side }, (_, j) =>
            j === side - 1 ? more(j + 1, rest) : frame(j + 1),
          )}
        </div>
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className="grid aspect-[4/3] min-h-0 grid-cols-2 grid-rows-1 gap-0.5 bg-black">
        {frame(0)}
        {frame(1)}
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="grid aspect-[4/5] min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-0.5 bg-black">
        {frame(0)}
        <div className="grid min-h-0 grid-cols-2 grid-rows-1 gap-0.5">
          {frame(1)}
          {frame(2)}
        </div>
      </div>
    );
  }
  if (n === 4) {
    return (
      <div className="grid aspect-square min-h-0 grid-cols-2 grid-rows-2 gap-0.5 bg-black">
        {media.map((_, i) => frame(i))}
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/5] min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-0.5 bg-black">
      <div className="grid min-h-0 grid-cols-2 grid-rows-1 gap-0.5">
        {frame(0)}
        {frame(1)}
      </div>
      <div className="grid min-h-0 grid-cols-3 grid-rows-1 gap-0.5">
        {frame(2)}
        {frame(3)}
        {more(4, n - 5)}
      </div>
    </div>
  );
}

function Copy({
  text,
  clamp,
  muted,
  className,
}: {
  text: string | null;
  clamp: boolean;
  muted: string;
  className?: string;
}) {
  const trimmed = text?.trim() ?? "";
  return (
    <p
      className={cn("whitespace-pre-wrap", clamp && "line-clamp-4", className)}
    >
      {trimmed || <span className={cn("italic", muted)}>No copy yet.</span>}
    </p>
  );
}

function AdCard({ ad, name }: { ad: SocialMockAd; name: string }) {
  return (
    <div className="flex items-center gap-2 bg-neutral-100 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracking-wide text-neutral-500">
          {domainOf(ad.link)}
        </p>
        <p className="truncate text-[13px] font-semibold">
          {ad.headline ?? name}
        </p>
      </div>
      <span className="shrink-0 rounded bg-neutral-200 px-2.5 py-1 text-[12px] font-medium">
        {ctaLabel(ad.callToAction)}
      </span>
    </div>
  );
}

type MockProps = {
  post: SocialMockPost;
  crop: string;
  card?: number;
  onCard?: (next: number) => void;
  play: boolean;
  clampText: boolean;
};

/* Facebook: Page header, copy above the media, photo grid or ad card, reaction bar. */
function FacebookMock({
  post,
  crop,
  card,
  onCard,
  play,
  clampText,
}: MockProps) {
  const meta = post.sponsored ? "Sponsored" : post.meta;
  return (
    <>
      <header className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <Avatar
          sources={post.avatars}
          initial={post.name.slice(0, 1).toUpperCase()}
          className="size-10"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold">{post.name}</div>
          <div className="flex items-center gap-1 text-xs text-[#65676b]">
            {meta ? <>{meta} · </> : null}
            <Globe className="size-3" />
          </div>
        </div>
        <MoreHorizontal className="size-5 text-[#65676b]" />
      </header>
      {(post.text || !post.ad) && (
        <Copy
          text={post.text}
          clamp={clampText}
          muted="text-[#65676b]"
          className="px-3 pb-3 text-[15px] leading-snug"
        />
      )}
      {post.ad ? (
        <>
          <Carousel
            media={post.media}
            crop={crop}
            card={card}
            onCard={onCard}
            play={play}
          />
          <AdCard ad={post.ad} name={post.name} />
        </>
      ) : (
        <FacebookPhotos media={post.media} crop={crop} play={play} />
      )}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-[#65676b]">
        <span className="flex items-center gap-1">
          <span className="grid size-4 place-items-center rounded-full bg-[#1877f2]">
            <ThumbsUp className="size-2.5 fill-white text-white" />
          </span>
          Reactions
        </span>
        <span>Comments · Shares</span>
      </div>
      <div className="mx-3 grid grid-cols-3 border-t border-black/10 py-1 text-[13px] font-medium text-[#65676b]">
        <span className="flex items-center justify-center gap-1.5 py-1.5">
          <ThumbsUp className="size-4" /> Like
        </span>
        <span className="flex items-center justify-center gap-1.5 py-1.5">
          <MessageCircle className="size-4" /> Comment
        </span>
        <span className="flex items-center justify-center gap-1.5 py-1.5">
          <Share2 className="size-4" /> Share
        </span>
      </div>
    </>
  );
}

/* Instagram: handle header, media first, CTA bar for ads, action row, handle-led caption. */
function InstagramMock({
  post,
  crop,
  card,
  onCard,
  play,
  clampText,
}: MockProps) {
  const handle = (post.handle ?? post.name).replace(/^@/, "");
  return (
    <>
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2px]">
          <Avatar
            sources={post.avatars}
            initial={handle.slice(0, 1).toUpperCase()}
            className="size-8 border-2 border-white"
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{handle}</div>
          {post.sponsored && (
            <div className="text-[11px] text-neutral-500">Sponsored</div>
          )}
        </div>
        <MoreHorizontal className="size-5" />
      </header>
      <Carousel
        media={post.media}
        crop={crop}
        card={card}
        onCard={onCard}
        play={play}
      />
      {post.ad && (
        <div className="flex items-center justify-between bg-[#1877f2] px-3 py-2 text-[13px] font-semibold text-white">
          {ctaLabel(post.ad.callToAction)}
          <ChevronRight className="size-4" />
        </div>
      )}
      <div className="flex items-center gap-4 px-3 pt-3 pb-2">
        <Heart className="size-6" />
        <MessageCircle className="size-6 -scale-x-100" />
        <Send className="size-6" />
        <Bookmark className="ml-auto size-6" />
      </div>
      <div className="px-3 pb-3 text-sm leading-snug">
        <p className={cn("whitespace-pre-wrap", clampText && "line-clamp-4")}>
          <span className="mr-1.5 font-semibold">{handle}</span>
          {post.text?.trim() || (
            <span className="text-neutral-500 italic">No copy yet.</span>
          )}
        </p>
        {post.firstComment && (
          <p className="mt-2 text-[13px] leading-snug text-neutral-700">
            <span className="mr-1.5 font-semibold text-black">{handle}</span>
            {post.firstComment}
          </p>
        )}
        {post.meta && !post.sponsored && (
          <p className="mt-2 text-[11px] tracking-wide text-neutral-500 uppercase">
            {post.meta}
          </p>
        )}
      </div>
    </>
  );
}

/* Story or Reel: the creative fills the card and the chrome sits on top of it. */
function StoryMock({ post, card, onCard, play }: MockProps) {
  const handle = (post.handle ?? post.name).replace(/^@/, "");
  return (
    <Carousel
      media={post.media}
      crop={CROP_CLASS.story}
      card={card}
      onCard={onCard}
      play={play}
    >
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 pb-8 text-white">
        <Avatar
          sources={post.avatars}
          initial={handle.slice(0, 1).toUpperCase()}
          className="size-7"
        />
        <span className="truncate text-[13px] font-semibold">{handle}</span>
        {post.sponsored && (
          <span className="text-[11px] text-white/80">Sponsored</span>
        )}
      </div>
      {(post.text || post.ad) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white">
          {post.text && (
            <p className="line-clamp-3 text-[12px] leading-snug">{post.text}</p>
          )}
          {post.ad && (
            <div className="mt-2 rounded-full bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-black">
              {ctaLabel(post.ad.callToAction)}
            </div>
          )}
        </div>
      )}
    </Carousel>
  );
}

/* Anything else: a neutral card with the platform's own order, copy then media. */
function GenericMock({ post, crop, card, onCard, play, clampText }: MockProps) {
  const handle = post.handle ? `@${post.handle.replace(/^@/, "")}` : null;
  const meta = post.sponsored ? "Sponsored" : post.meta;
  return (
    <>
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar
          sources={post.avatars}
          initial={post.name.slice(0, 1).toUpperCase()}
          className="size-8"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{post.name}</div>
          <div className="truncate text-xs text-neutral-500">
            {[handle, meta].filter(Boolean).join(" · ")}
          </div>
        </div>
        <MoreHorizontal className="size-5 text-neutral-400" />
      </header>
      <Copy
        text={post.text}
        clamp={clampText}
        muted="text-neutral-500"
        className="px-3 pb-3 text-[13px] leading-relaxed"
      />
      {post.media.length > 0 && (
        <Carousel
          media={post.media}
          crop={crop}
          card={card}
          onCard={onCard}
          play={play}
        />
      )}
      {post.ad && <AdCard ad={post.ad} name={post.name} />}
      {post.firstComment && (
        <p className="border-t px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
          <span className="font-medium">First comment · </span>
          {post.firstComment}
        </p>
      )}
    </>
  );
}

export function SocialPostMock({
  post,
  crop = "auto",
  card,
  onCard,
  play = true,
  clampText = false,
  className,
}: {
  post: SocialMockPost;
  /** Media crop; `auto` reads the first frame's shape. */
  crop?: SocialMockCrop;
  /** Controlled carousel index, for a viewer that pages from outside. */
  card?: number;
  onCard?: (next: number) => void;
  /** Play video in place (default) or show its poster. */
  play?: boolean;
  /** Clamp copy to four lines, the way a feed does before "See more". */
  clampText?: boolean;
  className?: string;
}) {
  const story = isVerticalFormat(post.format);
  const props: MockProps = {
    post,
    crop: cropClass(crop, post.media, post.platform),
    card,
    onCard,
    play,
    clampText,
  };
  return (
    <article
      className={cn(
        "w-full overflow-hidden bg-white text-[#050505] shadow-sm ring-1 ring-black/10",
        story ? "rounded-2xl" : "rounded-xl",
        className,
      )}
    >
      {story ? (
        <StoryMock {...props} />
      ) : post.platform === "facebook" ? (
        <FacebookMock {...props} />
      ) : post.platform === "instagram" ? (
        <InstagramMock {...props} />
      ) : (
        <GenericMock {...props} />
      )}
    </article>
  );
}
