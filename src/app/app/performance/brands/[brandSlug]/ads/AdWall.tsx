"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Home,
  ImagePlus,
  Loader2,
  Replace,
  Trash2,
  X,
} from "lucide-react";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockSurface,
} from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { Dropzone, MEDIA_ACCEPT } from "@/components/ui/dropzone";
import { cn } from "@/components/ui/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import {
  AD_FORMAT_LABEL,
  cardCapacity,
  type AdFormat,
} from "@/lib/performance-ads";
import type { MediaItem } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

import { HomePicker, type PickableHome } from "../HomePicker";

export type WallCard = {
  url: string;
  thumbnail: string | null;
  assetId: string | null;
  type: "image" | "video" | "carousel";
};

export type WallAd = {
  id: string;
  name: string;
  status: "drawn" | "approved";
  format: AdFormat;
  headline: string;
  body: string;
  callToAction: string | null;
  linkUrl: string | null;
  /** The WanderOS listing id of the home this ad is about. */
  homeId: string | null;
  homeName: string | null;
  homeUrl: string | null;
  cards: WallCard[];
};

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";
const FORMAT_ORDER: AdFormat[] = [
  "static",
  "carousel",
  "video",
  "portfolio",
  "catalog",
];

type HomeGroup = {
  homeId: string | null;
  homeName: string;
  homeUrl: string | null;
  ads: WallAd[];
};

/**
 * The wall's order: one group per home in the order the homes first appear,
 * each home's static before its carousel; ads about no home after them; the
 * portfolio and catalog ads last, as the slice that closes the set.
 */
export function groupWall(ads: WallAd[]) {
  const byFormat = (a: WallAd, b: WallAd) =>
    FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format);
  const slices = ads
    .filter((ad) => ad.format === "portfolio" || ad.format === "catalog")
    .sort(byFormat);
  const rest = ads.filter((ad) => !slices.includes(ad));
  const homes: HomeGroup[] = [];
  const other: WallAd[] = [];
  for (const ad of rest) {
    if (!ad.homeId && !ad.homeName) {
      other.push(ad);
      continue;
    }
    const key = ad.homeId ?? ad.homeName;
    let group = homes.find((row) => (row.homeId ?? row.homeName) === key);
    if (!group) {
      group = {
        homeId: ad.homeId,
        homeName: ad.homeName!,
        homeUrl: ad.homeUrl,
        ads: [],
      };
      homes.push(group);
    }
    group.ads.push(ad);
  }
  for (const group of homes) group.ads.sort(byFormat);
  return { homes, other: other.sort(byFormat), slices };
}

/**
 * Every drafted ad as it will run, filed under its home, before any of it
 * reaches Meta. Each tile is the real ad: its cards can be replaced, added
 * by upload or from the library, and removed; its copy edited; its home
 * swapped. Approving is not a push. Nothing here talks to a platform.
 */
export function AdWall({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  homes,
  ads,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  homes: PickableHome[];
  ads: WallAd[];
}) {
  const [surface, setSurface] = useState<AdMockSurface>("instagram");
  const grouped = groupWall(ads);
  const approved = ads.filter((ad) => ad.status === "approved").length;
  const shells = ads.filter((ad) => ad.cards.length === 0).length;
  const tile = {
    brandId,
    brandName,
    brandLogo,
    homes,
    surface,
  };

  if (ads.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={sectionLabel}>
          The wall · {ads.length} ads
          {approved ? ` · ${approved} approved` : ""}
          {shells ? ` · ${shells} awaiting creative` : ""}
        </p>
        <Tabs
          value={surface}
          onValueChange={(value) => setSurface(value as AdMockSurface)}
        >
          <TabsList>
            {AD_MOCK_SURFACES.map((option) => (
              <TabsTrigger
                key={option.id}
                value={option.id}
                className="text-xs"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {grouped.homes.map((group) => (
        <div key={group.homeId ?? group.homeName} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold">
              {group.homeId ? (
                <Link
                  href={`/app/performance/brands/${brandSlug}/homes/${group.homeId}`}
                  className="hover:underline"
                >
                  {group.homeName}
                </Link>
              ) : (
                group.homeName
              )}
            </p>
            {group.homeUrl ? (
              <a
                href={group.homeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground truncate text-[11px] hover:underline"
              >
                {group.homeUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
          </div>
          <ul className="grid gap-3 @3xl:grid-cols-2">
            {group.ads.map((ad) => (
              <AdTile key={ad.id} ad={ad} {...tile} />
            ))}
          </ul>
        </div>
      ))}

      {grouped.other.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">
            About no home in particular
          </p>
          <ul className="grid gap-3 @3xl:grid-cols-2">
            {grouped.other.map((ad) => (
              <AdTile key={ad.id} ad={ad} {...tile} />
            ))}
          </ul>
        </div>
      ) : null}

      {grouped.slices.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">The whole set</p>
          <ul className="space-y-3">
            {grouped.slices.map((ad) => (
              <AdTile key={ad.id} ad={ad} {...tile} slice />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** A picked library asset or upload as the wall hands it to the server. */
const assetIdOf = (item: MediaItem) => item.assetId ?? null;

function AdTile({
  ad,
  brandId,
  brandName,
  brandLogo,
  homes,
  surface,
  slice = false,
}: {
  ad: WallAd;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  homes: PickableHome[];
  surface: AdMockSurface;
  /** The portfolio and catalog rows: the cards laid out beside the mock. */
  slice?: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [card, setCard] = useState(0);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(ad.body);
  const [headline, setHeadline] = useState(ad.headline);
  // Which slot the library picker fills: a card index to replace, or "append".
  const [picking, setPicking] = useState<number | "append" | null>(null);
  const { uploadFiles, uploading } = useMediaUpload(brandId);

  const onError = (error: { message: string }) => toast.error(error.message);
  const refresh = () => router.refresh();
  const setStatus = useMutation(
    trpc.ads.setAdStatus.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setCopy = useMutation(
    trpc.ads.setAdCopy.mutationOptions({
      onSuccess: () => {
        toast.success("Copy saved.");
        setEditing(false);
        refresh();
      },
      onError,
    }),
  );
  const editCards = useMutation(
    trpc.ads.editAdCards.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setHome = useMutation(
    trpc.ads.setAdHome.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.homeName
            ? `Now about ${result.homeName}.`
            : "Unbound from its home.",
        );
        refresh();
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.ads.deleteAd.mutationOptions({ onSuccess: refresh, onError }),
  );

  const capacity = cardCapacity(ad.format);
  const canAdd = ad.cards.length < capacity;
  const canRemove = ad.cards.length > 0;
  const dirty = body !== ad.body || headline !== ad.headline;
  const busy =
    setStatus.isPending ||
    setCopy.isPending ||
    editCards.isPending ||
    setHome.isPending ||
    remove.isPending ||
    uploading > 0;

  /** Files dropped on a slot: into the library first, then onto the ad. */
  const dropped = async (files: File[], slot: number | "append") => {
    const items = await uploadFiles(files);
    const ids = items.map(assetIdOf).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    if (slot !== "append") {
      await editCards.mutateAsync({
        adId: ad.id,
        edit: { op: "replace", index: slot, mediaAssetId: ids[0]! },
      });
      return;
    }
    // Appended one at a time so a carousel keeps the drop's order.
    for (const id of ids) {
      await editCards.mutateAsync({
        adId: ad.id,
        edit: { op: "append", mediaAssetId: id },
      });
    }
  };
  const picked = (item: MediaItem) => {
    const id = assetIdOf(item);
    setPicking(null);
    if (!id) {
      toast.error("Pick something that is in the library");
      return;
    }
    editCards.mutate({
      adId: ad.id,
      edit:
        picking === "append" || picking === null
          ? { op: "append", mediaAssetId: id }
          : { op: "replace", index: picking, mediaAssetId: id },
    });
  };

  const shell = ad.cards.length === 0;
  const mock = shell ? (
    <Dropzone
      compact
      accept={MEDIA_ACCEPT}
      multiple={ad.format !== "static" && ad.format !== "video"}
      onFiles={(files) => void dropped(files, "append")}
      uploading={uploading}
      title={
        ad.format === "video"
          ? "Drop the clip"
          : ad.format === "static"
            ? "Drop the creative"
            : "Drop the cards, in order"
      }
      hint="or click to browse · saved to the library"
      className="min-h-40"
    />
  ) : (
    <AdMock
      surface={surface}
      brandName={brandName}
      brandLogo={brandLogo}
      body={ad.body}
      headline={ad.headline}
      link={ad.linkUrl}
      callToAction={ad.callToAction}
      media={ad.cards.map((item) => ({
        url: item.url,
        thumbnail: item.thumbnail,
        type: item.type,
      }))}
      card={card}
      onCard={ad.cards.length > 1 ? setCard : undefined}
      className={cn("w-full", surface === "story" ? "max-w-60" : "max-w-80")}
    />
  );

  const strip = (
    <ul className="flex flex-wrap gap-2">
      {ad.cards.map((item, index) => (
        <li key={`${ad.id}-${index}`} className="group relative">
          <button
            type="button"
            onClick={() => setCard(index)}
            title={`Card ${index + 1}`}
            className={cn(
              "block overflow-hidden rounded-lg border transition",
              card === index && ad.cards.length > 1
                ? "border-sky-400 ring-2 ring-sky-400/40"
                : "hover:border-white/30",
            )}
          >
            {item.type === "video" ? (
              <video
                src={item.url}
                className="size-16 bg-black object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnail ?? item.url}
                alt={`Card ${index + 1}`}
                loading="lazy"
                className="size-16 object-cover"
              />
            )}
          </button>
          <span className="absolute top-1 left-1 rounded-full bg-black/55 px-1.5 text-[9px] font-medium text-white">
            {index + 1}
          </span>
          <span className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/60 py-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicking(index)}
              title="Replace this card from the library"
              className="text-white hover:text-sky-300"
            >
              <Replace className="size-3" />
            </button>
            {canRemove ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  editCards.mutate({
                    adId: ad.id,
                    edit: { op: "remove", index },
                  })
                }
                title="Remove this card"
                className="text-white hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        </li>
      ))}
      {canAdd && !shell ? (
        <li>
          <Dropzone
            compact
            accept={MEDIA_ACCEPT}
            multiple={capacity > 1}
            onFiles={(files) => void dropped(files, "append")}
            uploading={uploading}
            title={capacity > 1 ? "Add cards" : "Add"}
            hint=""
            className="size-16 min-h-0 p-0 text-[9px]"
          />
        </li>
      ) : null}
      {canAdd && !shell ? (
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking("append")}
            title="Add a card from the library"
            className="text-muted-foreground hover:text-foreground grid size-16 place-items-center rounded-lg border text-[9px] hover:border-white/30"
          >
            <ImagePlus className="size-3.5" />
            Library
          </button>
        </li>
      ) : null}
    </ul>
  );

  return (
    <li className={cn(panel, "p-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-[11px]">
            {AD_FORMAT_LABEL[ad.format]}
            {ad.format === "video"
              ? ""
              : ` · ${ad.cards.length}/${capacity} ${capacity === 1 ? "card" : "cards"}`}
            {" · "}
            {ad.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* One question, so one control: in the set, or not. Approved is
              also what a rebuild leaves alone. */}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setStatus.mutate({
                adId: ad.id,
                status: ad.status === "approved" ? "drawn" : "approved",
              })
            }
            title={
              ad.status === "approved"
                ? "Approved. A rebuild leaves this one alone."
                : "Approve. Keeps it through the next rebuild."
            }
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium transition disabled:opacity-40",
              ad.status === "approved"
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "text-muted-foreground hover:text-foreground hover:border-white/30",
            )}
          >
            <Check className="size-3" />
            {ad.status === "approved" ? "Approved" : "Approve"}
          </button>
          {homes.length > 0 &&
          ad.format !== "portfolio" &&
          ad.format !== "catalog" ? (
            <HomePicker
              homes={homes}
              picked={ad.homeId ? [ad.homeId] : []}
              max={1}
              single
              title={
                ad.homeName
                  ? `Instead of ${ad.homeName}`
                  : "Which home is this ad about?"
              }
              label={ad.homeName ? "Change home" : "Bind a home"}
              onChange={(next) =>
                setHome.mutate({ adId: ad.id, propertyId: next[0] ?? null })
              }
            />
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate({ adId: ad.id })}
            title="Delete this ad"
            className="text-muted-foreground rounded-full p-1 hover:text-red-300 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 grid gap-3",
          slice ? "@2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]" : "",
        )}
      >
        <div className="flex justify-center @2xl:justify-start">{mock}</div>
        <div className="min-w-0 space-y-2">
          {strip}
          {!editing ? (
            <div className="space-y-1">
              <p className="truncate text-[12px] font-medium">{ad.headline}</p>
              <p className="text-muted-foreground line-clamp-3 text-[11px] leading-snug whitespace-pre-line">
                {ad.body || "No primary text yet."}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-sky-300 hover:underline"
              >
                Edit copy
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={60}
                placeholder="Headline"
                className="bg-muted/40 h-8 w-full rounded-lg border px-2.5 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                placeholder="Primary text"
                className="bg-muted/40 w-full resize-y rounded-lg border px-2.5 py-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-sky-400/40"
              />
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={!dirty || busy}
                  onClick={() =>
                    setCopy.mutate({ adId: ad.id, headline, body })
                  }
                  className="h-7 rounded-full px-3 text-[11.5px]"
                >
                  Save copy
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setBody(ad.body);
                    setHeadline(ad.headline);
                    setEditing(false);
                  }}
                  className="text-muted-foreground hover:text-foreground text-[11.5px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {busy ? (
            <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
              <Loader2 className="size-3 animate-spin" />
              {uploading > 0 ? "Bringing the file in…" : "Saving…"}
            </p>
          ) : null}
          {!ad.homeId &&
          ad.format !== "portfolio" &&
          ad.format !== "catalog" ? (
            <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
              <Home className="size-3" />
              {ad.homeName
                ? `Named for ${ad.homeName} by its file, not bound to a listing`
                : "About no home yet"}
              ; links to {ad.linkUrl ?? "the brand's site"}.
            </p>
          ) : null}
        </div>
      </div>

      {picking !== null ? (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(next) => !next && setPicking(null)}
          existingAssetIds={ad.cards.flatMap((item) =>
            item.assetId ? [item.assetId] : [],
          )}
          onPick={picked}
        />
      ) : null}
    </li>
  );
}
