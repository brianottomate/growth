import Link from "next/link";

import type { brandTable } from "@/server/db/schema";
import { BrandChannels, type ChannelLite } from "./BrandChannels";
import { BrandMenu } from "./BrandMenu";
import type { SuggestionLite } from "./SuggestedChannels";
import { TrackedBrands, type TrackedLite } from "./TrackedBrands";

/**
 * What still has to happen before a client's ads can run. Every item is a
 * column we already store, so this is a read of the record rather than a new
 * kind of state to keep in step with it.
 */
export type BrandReadiness = {
  accountId: string;
  intake: boolean;
  access: boolean;
  page: boolean;
  adAccount: boolean;
  homes: number;
  budget: number | null;
  creative: boolean;
};

export type PillarLite = {
  slug: string;
  name: string;
  color: string;
  posts: number;
};

export type PersonaLite = {
  name: string;
  description: string | null;
  ageRanges: string[] | null;
  count: number;
};

export type MediaLite = {
  total: number;
  liveAds: number;
  thumbs: { id: string; src: string; kind: string; inLiveAd: boolean }[];
};

const LABEL =
  "text-muted-foreground text-[10px] font-semibold tracking-wide uppercase";
const QUIET_LINK =
  "text-muted-foreground hover:text-foreground text-xs transition-colors";

/**
 * One card, four zones: identity · channels · strategy · media, with a
 * readiness checklist as the footer. The header carries only the quiet
 * navigation links; every other action lives in the ··· menu so the card
 * reads as a system surface rather than a toolbar.
 */
export function BrandCard({
  brand,
  channels,
  suggestions,
  tracked,
  readiness,
  postCountByPlatform,
  pillars,
  persona,
  media,
}: {
  brand: typeof brandTable.$inferSelect;
  channels: ChannelLite[];
  suggestions: SuggestionLite[];
  tracked: TrackedLite[];
  readiness: BrandReadiness | null;
  postCountByPlatform: Record<string, number>;
  pillars: PillarLite[];
  persona: PersonaLite | null;
  media: MediaLite;
}) {
  const detailHref = brand.slug ? `/app/brands/${brand.slug}` : null;
  const relationshipPill =
    brand.relationship === "client" || brand.relationship === "prospect"
      ? brand.relationship
      : brand.type;
  const blurb = brand.tagline ?? brand.description;

  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-sm">
      {/* identity */}
      <div className="flex items-start gap-3.5 px-5 py-4">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="size-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
            {brand.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {detailHref ? (
              <Link
                href={detailHref}
                className="text-[15px] font-semibold hover:underline"
              >
                {brand.name}
              </Link>
            ) : (
              <span className="text-[15px] font-semibold">{brand.name}</span>
            )}
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium">
              {relationshipPill}
            </span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className={QUIET_LINK}
              >
                {brand.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
          {blurb && (
            <p className="text-muted-foreground mt-0.5 truncate text-sm">
              {blurb}
            </p>
          )}
        </div>
        <nav className="flex shrink-0 items-center gap-4 pt-1 text-[13px]">
          {detailHref && (
            <>
              <Link
                href={detailHref}
                className="text-foreground/75 hover:text-foreground"
              >
                Strategy
              </Link>
              <Link
                href={`${detailHref}/ads`}
                className="text-foreground/75 hover:text-foreground"
              >
                Ads
              </Link>
            </>
          )}
          {readiness && (
            <Link
              href={`/app/performance/${readiness.accountId}`}
              className="text-foreground/75 hover:text-foreground"
            >
              Account
            </Link>
          )}
          <BrandMenu
            brand={{
              id: brand.id,
              name: brand.name,
              tagline: brand.tagline,
              description: brand.description,
              website: brand.website,
              logo: brand.logo,
              relationship: brand.relationship,
            }}
            zernioProfileId={brand.zernioProfileId}
            links={brand.links ?? []}
          />
        </nav>
      </div>

      {/* channels */}
      <div className="border-t px-5 py-4">
        <BrandChannels
          brandId={brand.id}
          channels={channels}
          suggestions={suggestions}
          postCountByPlatform={postCountByPlatform}
        />
      </div>

      {/* strategy */}
      <div className="grid gap-x-8 gap-y-4 border-t px-5 py-4 md:grid-cols-[1fr_1.15fr]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className={LABEL}>
              Pillars{pillars.length > 0 && ` · ${pillars.length}`}
            </span>
            {detailHref && (
              <Link href={`${detailHref}#strategy`} className={QUIET_LINK}>
                Strategy ↗
              </Link>
            )}
          </div>
          {pillars.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {pillars.map((p) => (
                <span
                  key={p.slug}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: p.color }}
                  />
                  {p.name}
                  {p.posts > 0 && (
                    <span className="text-muted-foreground tabular-nums">
                      · {p.posts} {p.posts === 1 ? "post" : "posts"}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              No pillars yet — the baseline drafts them once posts are in.
            </p>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className={LABEL}>
              Persona{persona && persona.count > 1 && `s · ${persona.count}`}
            </span>
            {persona && persona.count > 1 && (
              <Link href="/app/personas" className={QUIET_LINK}>
                All ↗
              </Link>
            )}
          </div>
          {persona ? (
            <p className="line-clamp-2 text-[13px] leading-snug">
              <span className="font-semibold">
                {persona.name}
                {persona.ageRanges?.length
                  ? `, ${persona.ageRanges.join(" · ")}`
                  : ""}
              </span>
              {persona.description && (
                <span className="text-muted-foreground">
                  {" "}
                  — {persona.description}
                </span>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              No personas yet — who the brand talks to, drafted from the
              baseline.
            </p>
          )}
        </div>
      </div>

      {/* media */}
      {media.total > 0 && (
        <div className="border-t px-5 py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className={LABEL}>Media · {media.total}</span>
              {media.liveAds > 0 && (
                <span className="text-muted-foreground text-[11px]">
                  {media.liveAds} live {media.liveAds === 1 ? "ad" : "ads"}
                </span>
              )}
            </span>
            <Link
              href={
                brand.slug ? `/app/media?brand=${brand.slug}` : "/app/media"
              }
              className={QUIET_LINK}
            >
              Library ↗
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
              {media.thumbs.map((t) => (
                <div
                  key={t.id}
                  className="bg-muted relative h-16 w-[88px] shrink-0 overflow-hidden rounded-lg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {t.inLiveAd && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                      ad · live
                    </span>
                  )}
                </div>
              ))}
              {media.total > media.thumbs.length && (
                <Link
                  href={
                    brand.slug
                      ? `/app/media?brand=${brand.slug}`
                      : "/app/media"
                  }
                  className="text-muted-foreground hover:text-foreground hover:border-foreground/30 flex h-16 w-[88px] shrink-0 items-center justify-center rounded-lg border border-dashed text-xs tabular-nums"
                >
                  +{media.total - media.thumbs.length}
                </Link>
              )}
            </div>
            <Link
              href="/app/studio"
              className="hover:bg-accent shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
            >
              Compose creative
            </Link>
          </div>
        </div>
      )}

      {/* readiness + tracking */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-5 py-3">
        {readiness ? (
          <ReadinessChecklist readiness={readiness} />
        ) : (
          <span />
        )}
        <TrackedBrands ownerBrandId={brand.id} tracked={tracked} />
      </div>
    </div>
  );
}

/**
 * The commercial to-do list as a checklist: done items read as facts, missing
 * items are links to the account page where they get fixed.
 */
function ReadinessChecklist({ readiness }: { readiness: BrandReadiness }) {
  const items: { label: string; done: boolean }[] = [
    { label: "Intake", done: readiness.intake },
    {
      label:
        readiness.budget != null
          ? `$${new Intl.NumberFormat("en-US").format(readiness.budget)}/mo`
          : "Budget",
      done: readiness.budget != null,
    },
    { label: "Access", done: readiness.access },
    { label: "Page", done: readiness.page },
    { label: "Ad account", done: readiness.adAccount },
    {
      label: readiness.homes > 0 ? `${readiness.homes} homes` : "Homes",
      done: readiness.homes > 0,
    },
    { label: "Creative", done: readiness.creative },
  ];
  const done = items.filter((i) => i.done);
  const missing = items.filter((i) => !i.done);
  const fixHref = `/app/performance/${readiness.accountId}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {done.length > 0 && (
        <>
          <span className={LABEL}>Ready</span>
          {done.map((i) => (
            <span
              key={i.label}
              className="font-medium text-emerald-600 dark:text-emerald-400"
            >
              ✓ {i.label}
            </span>
          ))}
        </>
      )}
      {missing.length > 0 && (
        <>
          <span
            className={`${LABEL} ${done.length > 0 ? "border-l pl-3" : ""} text-amber-600 dark:text-amber-400`}
          >
            Missing
          </span>
          {missing.map((i) => (
            <Link
              key={i.label}
              href={fixHref}
              className="font-medium text-amber-600 hover:underline dark:text-amber-400"
            >
              {i.label}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
