"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Code2, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";

import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { digestDesignStudioCode } from "@/lib/design-studio-export";
import {
  savingsLabel,
  stayLabel,
  type DigestProperty,
  type ListingsDigest,
} from "@/lib/listings-digest";
import { orpc } from "@/orpc/client";

type Slot = { section: number; property: number };

/**
 * wander.com caches one cheapest range per home, and for a few it is a month
 * ("$76,367 for 31 nights"). The card prints it; an email should not.
 */
const LONGEST_QUOTABLE_STAY = 7;

/**
 * Choose a photo for every home in a property digest.
 *
 * The homes, prices and links come out of a paste already. Matching them to
 * wander.com fills in the rest: the tier, the cheapest stay and its savings
 * line, and the photo, rendered for email with the Luxury or Iconic pill
 * baked in. A matched home's photo is changed from its own listing photos; a
 * home that is not on wander.com still takes one from the library.
 *
 * Edits go into the draft the workspace already owns, so nothing is written
 * until the operator saves, exactly like the subject and body fields.
 */
export function DigestImageBoard({
  digest,
  intro,
  brandId,
  onChange,
}: {
  digest: ListingsDigest;
  /** The issue's intro copy, which the Design Studio export sets above the homes. */
  intro?: string | null;
  brandId: string;
  onChange: (next: ListingsDigest) => void;
}) {
  // Which home a picker is choosing for, by position: names are not
  // guaranteed unique across regions.
  const [libraryTarget, setLibraryTarget] = useState<Slot | null>(null);
  const [heroTarget, setHeroTarget] = useState<
    (Slot & { homeId: string }) | null
  >(null);
  const [matching, setMatching] = useState<Slot | "all" | null>(null);

  const patch = (slot: Slot, next: Partial<DigestProperty>) =>
    onChange({
      ...digest,
      sections: digest.sections.map((section, s) =>
        s !== slot.section
          ? section
          : {
              ...section,
              properties: section.properties.map((property, p) =>
                p !== slot.property ? property : { ...property, ...next },
              ),
            },
      ),
    });

  const match = useMutation(
    orpc.newsletter.matchDigestHomes.mutationOptions({
      onSuccess: ({ digest: next, outcomes }) => {
        onChange(next);
        const failed = outcomes.filter((row) => row.status === "failed");
        const toPick = outcomes.filter(
          (row) => row.status === "ambiguous" || row.status === "missing",
        );
        const matched = outcomes.length - failed.length - toPick.length;
        if (failed.length) {
          toast.error(
            `${failed.length} of ${outcomes.length} could not be matched: ${failed[0]!.error?.slice(0, 160) ?? "unknown error"}`,
          );
        } else if (toPick.length) {
          toast.info(
            `${matched} of ${outcomes.length} matched · ${toPick.map((row) => row.name).join(", ")} need a pick`,
          );
        } else {
          toast.success(
            outcomes.length === 1
              ? `Matched ${outcomes[0]!.name}`
              : `Matched all ${outcomes.length} homes`,
          );
        }
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setMatching(null),
    }),
  );
  const runMatch = (only?: Slot, from = digest) => {
    setMatching(only ?? "all");
    match.mutate({ digest: from, only });
  };

  /** Point an entry at one listing and match just that one. */
  const pick = (slot: Slot, url: string) => {
    const next: ListingsDigest = {
      ...digest,
      sections: digest.sections.map((section, s) =>
        s !== slot.section
          ? section
          : {
              ...section,
              properties: section.properties.map((property, p) =>
                p !== slot.property
                  ? property
                  : { ...property, href: url, homeId: null, candidates: null },
              ),
            },
      ),
    };
    onChange(next);
    runMatch(slot, next);
  };

  // The inputs hold what is typed; the digest only takes a whole window.
  const [stayDraft, setStayDraft] = useState({
    checkIn: digest.stayWindow?.checkIn ?? "",
    checkOut: digest.stayWindow?.checkOut ?? "",
  });
  const setWindow = (edge: "checkIn" | "checkOut", value: string) => {
    const next = { ...stayDraft, [edge]: value };
    setStayDraft(next);
    const whole = next.checkIn && next.checkOut && next.checkOut > next.checkIn;
    if (whole || (!next.checkIn && !next.checkOut))
      onChange({ ...digest, stayWindow: whole ? next : null });
  };

  const homes = digest.sections.flatMap((section) => section.properties);
  const missing = homes.filter((property) => !property.imageUrl).length;
  const matched = homes.filter((property) => property.homeId).length;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">Digest photos</h2>
          <p className="text-xs text-muted-foreground">
            {missing === 0
              ? `All ${homes.length} homes have a photo`
              : `${missing} of ${homes.length} still need one`}
            {matched > 0 ? ` · ${matched} on wander.com` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={match.isPending}
            onClick={() => runMatch()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {matching === "all" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {matched > 0 ? "Refresh from wander.com" : "Match wander.com homes"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  digestDesignStudioCode(digest, { bodyMarkdown: intro }),
                );
                toast.success("Design Studio code copied");
              } catch {
                toast.error("Could not copy to the clipboard");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Code2 className="size-3.5" />
            Copy Design Studio code
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Stay</span>
        <input
          type="date"
          aria-label="Check-in"
          value={stayDraft.checkIn}
          onChange={(event) => setWindow("checkIn", event.target.value)}
          className="rounded-md border bg-background px-2 py-1"
        />
        <span className="text-muted-foreground">to</span>
        <input
          type="date"
          aria-label="Check-out"
          value={stayDraft.checkOut}
          min={stayDraft.checkIn || undefined}
          onChange={(event) => setWindow("checkOut", event.target.value)}
          className="rounded-md border bg-background px-2 py-1"
        />
        {!digest.stayWindow ? (
          <span className="text-muted-foreground">
            each home&apos;s cheapest stay
          </span>
        ) : null}
      </div>

      <div className="space-y-4">
        {digest.sections.map((section, sectionIndex) => (
          <div key={`${section.heading}-${sectionIndex}`}>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {section.heading}
            </p>
            <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
              {section.properties.map((property, propertyIndex) => {
                const slot = {
                  section: sectionIndex,
                  property: propertyIndex,
                };
                const busy =
                  matching === "all" ||
                  (matching !== null &&
                    matching.section === sectionIndex &&
                    matching.property === propertyIndex);
                return (
                  <HomeTile
                    key={`${property.name}-${propertyIndex}`}
                    property={property}
                    featured={propertyIndex === 0}
                    busy={busy}
                    onChoosePhoto={() =>
                      property.homeId
                        ? setHeroTarget({ ...slot, homeId: property.homeId })
                        : setLibraryTarget(slot)
                    }
                    onRemovePhoto={() => patch(slot, { imageUrl: null })}
                    onPick={(url) => pick(slot, url)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {libraryTarget && (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(open) => !open && setLibraryTarget(null)}
          onPick={(item) => {
            if (item.url) patch(libraryTarget, { imageUrl: item.url });
            setLibraryTarget(null);
          }}
          // Nothing is "already added" here: the same photo may legitimately
          // appear against more than one home across a digest.
          existingAssetIds={[]}
        />
      )}
      {heroTarget && (
        <HeroPickerDialog
          homeId={heroTarget.homeId}
          onClose={() => setHeroTarget(null)}
          onPicked={(result) => {
            patch(heroTarget, result);
            setHeroTarget(null);
          }}
        />
      )}
    </section>
  );
}

function HomeTile({
  property,
  featured,
  busy,
  onChoosePhoto,
  onRemovePhoto,
  onPick,
}: {
  property: DigestProperty;
  featured: boolean;
  busy: boolean;
  onChoosePhoto: () => void;
  onRemovePhoto: () => void;
  onPick: (url: string) => void;
}) {
  const unmatched = !property.homeId && property.candidates;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onChoosePhoto}
        title={
          property.imageUrl
            ? `Replace the photo for ${property.name}`
            : `Choose a photo for ${property.name}`
        }
        className={cn(
          "group relative block aspect-[3/2] w-full overflow-hidden rounded-lg border bg-muted transition-colors",
          property.imageUrl
            ? "hover:ring-2 hover:ring-foreground/30"
            : "border-dashed hover:border-solid",
        )}
      >
        {property.imageUrl ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={property.imageUrl}
            alt={property.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="size-4" />
            <span className="text-[10px] font-medium">Image needed</span>
          </span>
        )}
        {property.operated && (
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Hero
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2 className="size-4 animate-spin" />
          </span>
        )}
      </button>

      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-[11px]" title={property.name}>
            {property.name}
          </p>
          {property.stay ? (
            <p
              className={cn(
                "text-[10px]",
                property.stay.nights > LONGEST_QUOTABLE_STAY
                  ? "text-amber-500"
                  : "text-muted-foreground",
              )}
              title={
                property.stay.nights > LONGEST_QUOTABLE_STAY
                  ? "wander.com's cheapest cached stay for this home is longer than a week"
                  : undefined
              }
            >
              {stayLabel(property.stay)}
            </p>
          ) : null}
          {property.stayUnavailable ? (
            <p className="text-[10px] text-amber-500">
              Not bookable for the stay dates
            </p>
          ) : null}
          {property.savingsUsd ? (
            <p className="text-[10px] text-emerald-500">
              {savingsLabel(property.savingsUsd, featured)}
            </p>
          ) : null}
          {/* The source page is where the operator checks a match, so it
              has to be one click away. */}
          {property.href && (
            <a
              href={property.href}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open listing
            </a>
          )}
        </div>
        {property.imageUrl && (
          <button
            type="button"
            aria-label={`Remove the photo for ${property.name}`}
            title="Remove photo"
            onClick={onRemovePhoto}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {unmatched ? (
        <div className="space-y-1 rounded-md border border-dashed p-1.5">
          <p className="text-[10px] font-medium text-amber-500">
            {property.candidates!.length > 0
              ? "Which one?"
              : "Not found on wander.com"}
          </p>
          {property.candidates!.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(option.url)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent disabled:opacity-50"
            >
              {option.thumbUrl ? (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={option.thumbUrl}
                  alt=""
                  className="size-6 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="min-w-0 truncate text-[10px]">
                {option.name}
                {option.city ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {option.city}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A matched home's own photos, exteriors first; one click makes the hero. */
function HeroPickerDialog({
  homeId,
  onClose,
  onPicked,
}: {
  homeId: string;
  onClose: () => void;
  onPicked: (result: { heroUrl: string; imageUrl: string }) => void;
}) {
  const photos = useQuery(
    orpc.newsletter.digestHomePhotos.queryOptions({ input: { homeId } }),
  );
  const setHero = useMutation(
    orpc.newsletter.setDigestHomeHero.mutationOptions({
      onSuccess: onPicked,
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <SimpleDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={photos.data?.name ?? "Photos"}
      size="lg"
      scrollable
    >
      {photos.isPending ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(photos.data?.photos ?? []).map((photo) => {
            const current = photo.url === photos.data?.heroUrl;
            const saving =
              setHero.isPending && setHero.variables?.heroUrl === photo.url;
            return (
              <li key={photo.url}>
                <button
                  type="button"
                  disabled={setHero.isPending}
                  onClick={() => setHero.mutate({ homeId, heroUrl: photo.url })}
                  className={cn(
                    "relative block aspect-[3/2] w-full overflow-hidden rounded-lg border transition disabled:opacity-60",
                    current
                      ? "ring-2 ring-ring"
                      : "hover:ring-2 hover:ring-foreground/30",
                  )}
                >
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                  {saving && (
                    <span className="absolute inset-0 grid place-items-center bg-background/60">
                      <Loader2 className="size-4 animate-spin" />
                    </span>
                  )}
                </button>
                <p className="truncate pt-1 text-[10px] text-muted-foreground">
                  {current ? "Hero" : (photo.room ?? "Photo")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </SimpleDialog>
  );
}
