"use client";
import { destinationLabel, safeHomeUrl } from "@/lib/ad-preview-links";

import { useState } from "react";
import { MediaAssetView } from "@/components/media-asset-view";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Eye,
  Home,
  ImagePlus,
  Loader2,
  Replace,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockSurface,
} from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Dropzone, MEDIA_ACCEPT } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { AdPreviewDialog } from "@/app/app/brands/[brandSlug]/ads/_views/AdPreviewDialog";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import {
  cardsForSurface,
  groupWall,
  groupWallByFormat,
  type AdState,
  type WallAd,
  type WallCard,
} from "@/lib/ad-wall";
import {
  AD_FORMAT_LABEL,
  type AdFormat,
  cardCapacity,
} from "@/lib/performance-ads";
import type { MediaItem } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

import {
  HomePicker,
  type PickableHome,
} from "@/app/app/performance/clients/[brandSlug]/HomePicker";

export { groupWall } from "@/lib/ad-wall";
export type { WallAd } from "@/lib/ad-wall";

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";
/**
 * Every drafted ad as it will run, filed under its home, before any of it
 * reaches Meta. Each tile is the real ad: its cards can be replaced, added
 * by upload or from the library, and removed; its copy edited; its home
 * swapped. Approving is not a push. An ad already on a platform is shown
 * and left alone. Nothing here talks to a platform.
 */
export function AdWall({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  landingUrl = null,
  homes,
  ads,
  states = {},
  title = "The wall",
  groupBy = "home",
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  /** The campaign's landing page, for the Meta render of an ad without a link. */
  landingUrl?: string | null;
  /** Their homes, for binding; empty when their site is not connected. */
  homes: PickableHome[];
  ads: WallAd[];
  /** Where each ad stands on a platform; an ad on one is read-only here. */
  states?: Record<string, AdState>;
  title?: string;
  /** How the wall is sectioned: by the home an ad is about, or by format. */
  groupBy?: "home" | "format";
}) {
  const [surface, setSurface] = useState<AdMockSurface>("instagram");
  const [platformPreview, setPlatformPreview] = useState(false);
  const grouped = groupWall(ads);
  const formatGroups = groupBy === "format" ? groupWallByFormat(ads) : null;
  const formatLabel = (key: string) =>
    key === "text" ? "Text ads" : (AD_FORMAT_LABEL[key as AdFormat] ?? key);
  const approved = ads.filter((ad) => ad.status === "approved").length;
  const shells = ads.filter((ad) => ad.cards.length === 0).length;
  const tile = {
    brandId,
    brandSlug,
    brandName,
    brandLogo,
    landingUrl,
    homes,
    surface,
    platformPreview,
    states,
  };

  if (ads.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={sectionLabel}>
          {title} · {ads.length} ads
          {approved ? ` · ${approved} approved` : ""}
          {shells ? ` · ${shells} awaiting creative` : ""}
        </p>
        <Button
          variant="outline"
          aria-pressed={platformPreview}
          onClick={() => setPlatformPreview(!platformPreview)}
        >
          {platformPreview ? "Show media" : "Platform previews"}
        </Button>
        {platformPreview && (
          <Tabs
            value={surface}
            onValueChange={(value) => setSurface(value as AdMockSurface)}
          >
            <TabsList>
              {AD_MOCK_SURFACES.map((option) => (
                <TabsTrigger key={option.id} value={option.id} textSize="xs">
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {formatGroups
        ? formatGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <p className="text-[13px] font-semibold">
                {formatLabel(group.key)} · {group.ads.length}
              </p>
              <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
                {group.ads.map((ad) => (
                  <AdTile key={ad.id} ad={ad} {...tile} />
                ))}
              </ul>
            </div>
          ))
        : null}

      {!formatGroups &&
        grouped.homes.map((group) => (
          <div key={group.homeId ?? group.homeName} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold">
                {group.homeId ? (
                  <Link
                    href={`/app/performance/clients/${brandSlug}/homes/${group.homeId}`}
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
                  className="truncate text-[11px] text-muted-foreground hover:underline"
                >
                  {group.homeUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
            <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
              {group.ads.map((ad) => (
                <AdTile key={ad.id} ad={ad} {...tile} />
              ))}
            </ul>
          </div>
        ))}

      {!formatGroups && grouped.other.length > 0 ? (
        <div className="space-y-2">
          {/* Only frame these as "no home" when there ARE home ads to
              contrast against. A campaign with zero home ads is just ads;
              a home ad is one opt-in flavor, not the default. */}
          {grouped.homes.length > 0 ? (
            <p className="text-[13px] font-semibold">
              About no home in particular
            </p>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {grouped.other.map((ad) => (
              <AdTile key={ad.id} ad={ad} {...tile} />
            ))}
          </ul>
        </div>
      ) : null}

      {!formatGroups && grouped.slices.length > 0 ? (
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

export function AdTile({
  ad,
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  landingUrl,
  homes,
  surface,
  states,
  slice = false,
  allowHomeBinding = true,
  platformPreview = false,
}: {
  ad: WallAd;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  landingUrl: string | null;
  homes: PickableHome[];
  surface: AdMockSurface;
  states: Record<string, AdState>;
  /** The portfolio and catalog rows: the cards laid out beside the mock. */
  slice?: boolean;
  allowHomeBinding?: boolean;
  platformPreview?: boolean;
}) {
  const router = useRouter();
  const [card, setCard] = useState(0);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [naming, setNaming] = useState(false);
  const [homeName, setHomeName] = useState(ad.homeName ?? "");
  const [body, setBody] = useState(ad.body);
  const [headline, setHeadline] = useState(ad.headline);
  // Which slot the library picker fills: a card index to replace, or "append".
  const [picking, setPicking] = useState<number | "append" | null>(null);
  const { uploadFiles, uploading } = useMediaUpload(brandId);
  // An ad already on a platform keeps the platform's copy of itself; the
  // tile shows it and changes nothing.
  const state = states[ad.id] ?? "draft";
  const locked = state !== "draft";

  const onError = (error: { message: string }) => toast.error(error.message);
  const refresh = () => router.refresh();
  const setStatus = useMutation(
    orpc.ads.setAdStatus.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setTextOnly = useMutation(
    orpc.ads.setAdTextOnly.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setCopy = useMutation(
    orpc.ads.setAdCopy.mutationOptions({
      onSuccess: () => {
        toast.success("Copy saved.");
        setEditing(false);
        refresh();
      },
      onError,
    }),
  );
  const editCards = useMutation(
    orpc.ads.editAdCards.mutationOptions({ onSuccess: refresh, onError }),
  );
  const setHome = useMutation(
    orpc.ads.setAdHome.mutationOptions({
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
    orpc.ads.deleteAd.mutationOptions({ onSuccess: refresh, onError }),
  );

  const capacity = cardCapacity(ad.format);
  const bindable = ad.format !== "portfolio" && ad.format !== "catalog";
  const canAdd = !locked && ad.cards.length < capacity;
  const canRemove = !locked && ad.cards.length > 0;
  const dirty = body !== ad.body || headline !== ad.headline;
  const busy =
    locked ||
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
  const mock = ad.textOnly ? (
    // A text-only idea is copy alone: render it as a search result, not a
    // feed card, and never nag for a creative.
    <div className="w-full max-w-96 min-w-0 rounded-xl border bg-card p-4 text-left">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Sponsored · Search preview
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium text-primary">
        {ad.headline || "Headline"}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {destinationLabel(ad.linkUrl ?? landingUrl ?? "wander.com")}
      </p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
        {ad.body || "Description"}
      </p>
    </div>
  ) : shell ? (
    <Dropzone
      compact
      accept={MEDIA_ACCEPT}
      multiple={capacity > 1}
      disabled={locked}
      onFiles={(files) => void dropped(files, "append")}
      uploading={uploading}
      title={
        ad.format === "video"
          ? "Drop the clip"
          : ad.format === "static"
            ? "Drop the creative"
            : ad.format === "catalog"
              ? "Drop one card per home, in order"
              : "Drop the cards, in order"
      }
      hint="or click to browse · saved to the library"
      className="min-h-40"
    />
  ) : !platformPreview ? (
    <div className="w-full max-w-80 space-y-3">
      <div className="aspect-square">
        <MediaAssetView
          item={{
            ...ad.cards[Math.min(card, ad.cards.length - 1)]!,
            thumbnail:
              ad.cards[Math.min(card, ad.cards.length - 1)]?.thumbnail ??
              undefined,
            assetId:
              ad.cards[Math.min(card, ad.cards.length - 1)]?.assetId ??
              undefined,
          }}
          label={ad.name}
        />
      </div>
    </div>
  ) : (
    <AdMock
      surface={surface}
      brandName={brandName}
      brandLogo={brandLogo}
      body={ad.body}
      headline={ad.headline}
      link={ad.linkUrl ?? landingUrl}
      callToAction={ad.callToAction}
      media={cardsForSurface(ad.cards, surface)}
      card={card}
      onCard={ad.cards.length > 1 ? setCard : undefined}
      className={cn("w-full", surface === "story" ? "max-w-60" : "max-w-80")}
    />
  );

  const strip = (
    <ul className="flex flex-wrap gap-2">
      {ad.cards.map((item, index) => (
        <li
          key={`${ad.id}-${index}`}
          className="group relative flex items-start gap-1"
        >
          <div className="relative">
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
                // oxlint-disable-next-line nextjs/no-img-element
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
            {locked ? null : (
              <span className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/60 py-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
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
            )}
          </div>
          {item.type !== "video" ? (
            <StorySlot
              card={item}
              locked={locked}
              busy={busy}
              onSet={(mediaAssetId) =>
                editCards.mutate({
                  adId: ad.id,
                  edit: { op: "setStory", index, mediaAssetId },
                })
              }
              onClear={() =>
                editCards.mutate({
                  adId: ad.id,
                  edit: { op: "clearStory", index },
                })
              }
              onMake={(how) =>
                editCards.mutate({
                  adId: ad.id,
                  edit: { op: "makeStory", index, how },
                })
              }
              onUpload={async (files) => {
                const items = await uploadFiles(files);
                const id = items.map(assetIdOf).find(Boolean);
                if (id) {
                  editCards.mutate({
                    adId: ad.id,
                    edit: { op: "setStory", index, mediaAssetId: id },
                  });
                }
              }}
              brandId={brandId}
            />
          ) : null}
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
            density="thumbnail"
            className="size-16 min-h-0"
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
            className="grid size-16 grid-cols-1 place-items-center rounded-lg border text-[9px] text-muted-foreground hover:border-white/30 hover:text-foreground"
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
          <p className="truncate text-[11px] text-muted-foreground">
            {ad.textOnly ? (
              "Text ad"
            ) : (
              <>
                {AD_FORMAT_LABEL[ad.format]}
                {ad.format === "video"
                  ? ""
                  : ` · ${ad.cards.length}/${capacity} ${capacity === 1 ? "card" : "cards"}`}
              </>
            )}
            {" · "}
            {ad.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {locked ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                state === "live"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {state}
            </span>
          ) : (
            // One question, so one control: in the set, or not. Approved is
            // also what a rebuild leaves alone.
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setStatus.mutate({
                  adId: ad.id,
                  status: ad.status === "approved" ? "drawn" : "approved",
                  expectedUpdatedAt: ad.updatedAt,
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
                  : "text-muted-foreground hover:border-white/30 hover:text-foreground",
              )}
            >
              <Check className="size-3" />
              {ad.status === "approved" ? "Approved" : "Approve"}
            </button>
          )}
          {!locked ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setTextOnly.mutate({ adId: ad.id, textOnly: !ad.textOnly })
              }
              title={
                ad.textOnly
                  ? "Add a creative — make it a visual ad (Meta, LinkedIn…)"
                  : "Make text-only — copy alone (Google Search, OpenAI)"
              }
              className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:border-white/30 hover:text-foreground disabled:opacity-40"
            >
              {ad.textOnly ? "Add creative" : "Text only"}
            </button>
          ) : null}
          {allowHomeBinding && !locked && bindable ? (
            homes.length > 0 ? (
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
            ) : (
              <Button
                size="sm"
                variant="ghost"
                shape="round"
                density="editorial"
                onClick={() => setNaming(true)}
              >
                {ad.homeName ? "Rename home" : "+ Home"}
              </Button>
            )
          ) : null}
          {!shell ? (
            <button
              type="button"
              onClick={() => setChecking(true)}
              title="Platform preview"
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <Eye className="size-3.5" />
            </button>
          ) : null}
          {locked ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate({ adId: ad.id })}
              title="Delete this ad"
              className="rounded-full p-1 text-muted-foreground hover:text-red-300 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "mt-3 grid grid-cols-1 gap-3",
          slice ? "@2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]" : "",
        )}
      >
        <div className="flex min-w-0 justify-start">{mock}</div>
        <div className="min-w-0 space-y-2">
          {ad.textOnly ? null : strip}
          {!editing ? (
            <div className="space-y-1">
              {!ad.textOnly && (
                <>
                  <p className="truncate text-[12px] font-medium">
                    {ad.headline}
                  </p>
                  <p className="line-clamp-3 text-[11px] leading-snug whitespace-pre-line text-muted-foreground">
                    {ad.body || "No primary text yet."}
                  </p>
                </>
              )}
              {locked ? null : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[11px] text-sky-300 hover:underline"
                >
                  Edit copy
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={60}
                placeholder="Headline"
                className="h-8 w-full rounded-lg border bg-muted/40 px-2.5 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                placeholder="Primary text"
                className="w-full resize-y rounded-lg border bg-muted/40 px-2.5 py-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-sky-400/40"
              />
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={!dirty || busy}
                  onClick={() =>
                    setCopy.mutate({ adId: ad.id, headline, body })
                  }
                  shape="round"
                  density="editorial"
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
                  className="text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {busy && !locked ? (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {uploading > 0 ? "Bringing the file in…" : "Saving…"}
            </p>
          ) : null}
          {!ad.homeId && bindable ? (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {ad.homeName ? (
                <>
                  <Home className="size-3" />
                  {`${ad.homeName}, by name; no listing on their site yet. `}
                </>
              ) : null}
              {safeHomeUrl(ad.linkUrl ?? landingUrl) ? (
                <a
                  href={safeHomeUrl(ad.linkUrl ?? landingUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  title={ad.linkUrl ?? landingUrl ?? undefined}
                  className="min-w-0 truncate underline underline-offset-4"
                >
                  Open {destinationLabel(ad.linkUrl ?? landingUrl!)} ↗
                </a>
              ) : (
                "Links to the brand’s site."
              )}
            </p>
          ) : null}
        </div>
      </div>

      {checking ? (
        <AdPreviewDialog
          ad={{
            id: ad.id,
            name: ad.name,
            headline: ad.headline,
            body: ad.body,
            linkUrl: ad.linkUrl,
            callToAction: ad.callToAction,
            media: ad.cards.map((item) => ({
              url: item.url,
              thumbnail: item.thumbnail,
              type: item.type,
            })),
          }}
          brandName={brandName}
          brandLogo={brandLogo}
          brandSlug={brandSlug}
          landingUrl={landingUrl}
          open
          onOpenChange={(next) => !next && setChecking(false)}
        />
      ) : null}
      <SimpleDialog
        open={naming}
        onOpenChange={setNaming}
        title="Which home is this ad about?"
        description="Their site is not connected, so the home is a name for now. The listing takes over once it is."
        size="sm"
        footer={
          <Button
            size="sm"
            loading={setHome.isPending}
            onClick={() => {
              setNaming(false);
              setHome.mutate({
                adId: ad.id,
                homeName: homeName.trim() || null,
              });
            }}
          >
            {homeName.trim() ? "Bind" : "Unbind"}
          </Button>
        }
      >
        <Input
          value={homeName}
          onChange={(event) => setHomeName(event.target.value)}
          placeholder="Sonoma Glass House"
          autoFocus
        />
      </SimpleDialog>
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

const VIA_LABEL: Record<NonNullable<WallCard["story"]>["via"], string> = {
  upload: "uploaded",
  crop: "cropped",
  extend: "extended",
  render: "rendered",
};

/**
 * The 9:16 beside a card: what stories and reels show instead of the
 * baseline. Empty, it offers the ways to get one, best first: derive it
 * (re-render, extend, or crop, whichever the card allows), or bring a file.
 */
function StorySlot({
  card,
  locked,
  busy,
  brandId,
  onSet,
  onClear,
  onMake,
  onUpload,
}: {
  card: WallCard;
  locked: boolean;
  busy: boolean;
  brandId: string;
  onSet: (mediaAssetId: string) => void;
  onClear: () => void;
  onMake: (how: "auto" | "crop" | "extend" | "render") => void;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const story = card.story;
  return (
    <>
      {story ? (
        <div
          className="group/story relative"
          title={`Story · ${VIA_LABEL[story.via]}`}
        >
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={story.thumbnail ?? story.url}
            alt="Story"
            className="h-16 w-9 rounded-md border object-cover"
          />
          <span className="absolute bottom-0 left-0 w-full truncate rounded-b-md bg-black/60 px-0.5 text-center text-[7px] text-white">
            {VIA_LABEL[story.via]}
          </span>
          {locked ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={onClear}
              title="Drop the story file; stories will crop the baseline"
              className="absolute -top-1 -right-1 hidden rounded-full bg-black/70 p-0.5 text-white group-hover/story:block hover:text-red-300"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      ) : locked ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(true)}
          title="Give stories and reels their own 9:16"
          className="flex h-16 w-9 flex-col items-center justify-center rounded-md border border-dashed text-[8px] text-muted-foreground hover:border-white/30 hover:text-foreground disabled:opacity-40"
        >
          <Smartphone className="size-3" />
          9:16
        </button>
      )}
      <SimpleDialog
        open={open}
        onOpenChange={setOpen}
        title="A 9:16 for stories and reels"
        description="Without one, Meta crops the baseline. Derive one from it, or bring a file."
        size="sm"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {
                  how: "auto",
                  label: "Make it",
                  hint: "Best method for this card",
                },
                {
                  how: "extend",
                  label: "Extend",
                  hint: "More sky and ground, by AI",
                },
                { how: "crop", label: "Crop", hint: "Centred, edges go" },
              ] as const
            ).map((option) => (
              <button
                key={option.how}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onMake(option.how);
                }}
                className="rounded-xl border p-2 text-left hover:border-white/30"
              >
                <p className="text-xs font-medium">{option.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {option.hint}
                </p>
              </button>
            ))}
          </div>
          <Dropzone
            compact
            accept={MEDIA_ACCEPT}
            multiple={false}
            onFiles={(files) => {
              setOpen(false);
              void onUpload(files);
            }}
            title="Drop the 9:16"
            hint="or click to browse · saved to the library"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              setOpen(false);
              setPicking(true);
            }}
          >
            <ImagePlus className="size-3.5" />
            From the library
          </Button>
        </div>
      </SimpleDialog>
      {picking ? (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(next) => !next && setPicking(false)}
          existingAssetIds={card.assetId ? [card.assetId] : []}
          onPick={(item) => {
            setPicking(false);
            if (item.assetId) onSet(item.assetId);
          }}
        />
      ) : null}
    </>
  );
}
