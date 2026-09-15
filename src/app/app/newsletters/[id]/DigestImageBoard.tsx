"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { cn } from "@/components/ui/lib/utils";
import type { ListingsDigest } from "@/lib/listings-digest";

/**
 * Choose a photo for every home in a property digest.
 *
 * The homes, prices and links come out of a paste already; photos are the one
 * thing the source never carries, so this is the last manual step before an
 * issue is sendable. It reuses the content pool's own library picker rather
 * than growing a second one — same dialog, same brand-scoped library, same
 * MediaItem coming back.
 *
 * Edits go into the draft the workspace already owns, so nothing is written
 * until the operator saves, exactly like the subject and body fields.
 */
export function DigestImageBoard({
  digest,
  brandId,
  onChange,
}: {
  digest: ListingsDigest;
  brandId: string;
  onChange: (next: ListingsDigest) => void;
}) {
  // Which home the picker is currently choosing for, by position: names are
  // not guaranteed unique across regions.
  const [target, setTarget] = useState<{
    section: number;
    property: number;
  } | null>(null);

  const setImage = (
    sectionIndex: number,
    propertyIndex: number,
    imageUrl: string | null,
  ) =>
    onChange({
      ...digest,
      sections: digest.sections.map((section, s) =>
        s !== sectionIndex
          ? section
          : {
              ...section,
              properties: section.properties.map((property, p) =>
                p !== propertyIndex ? property : { ...property, imageUrl },
              ),
            },
      ),
    });

  const homes = digest.sections.flatMap((section) => section.properties);
  const missing = homes.filter((property) => !property.imageUrl).length;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Digest photos</h2>
        <p className="text-xs text-muted-foreground">
          {missing === 0
            ? `All ${homes.length} homes have a photo`
            : `${missing} of ${homes.length} still need one`}
        </p>
      </div>

      <div className="space-y-4">
        {digest.sections.map((section, sectionIndex) => (
          <div key={`${section.heading}-${sectionIndex}`}>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {section.heading}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {section.properties.map((property, propertyIndex) => (
                <div
                  key={`${property.name}-${propertyIndex}`}
                  className="space-y-1"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setTarget({
                        section: sectionIndex,
                        property: propertyIndex,
                      })
                    }
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
                        <span className="text-[10px] font-medium">
                          Image needed
                        </span>
                      </span>
                    )}
                    {property.operated && (
                      <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Hero
                      </span>
                    )}
                  </button>

                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-[11px]" title={property.name}>
                        {property.name}
                      </p>
                      {/* The source page is where the operator goes to grab a
                          photo, so it has to be one click away, not buried in
                          a chat message from earlier. */}
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
                        onClick={() =>
                          setImage(sectionIndex, propertyIndex, null)
                        }
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {target && (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(open) => !open && setTarget(null)}
          onPick={(item) => {
            if (item.url) setImage(target.section, target.property, item.url);
            setTarget(null);
          }}
          // Nothing is "already added" here: the same photo may legitimately
          // appear against more than one home across a digest.
          existingAssetIds={[]}
        />
      )}
    </section>
  );
}
