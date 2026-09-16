import { cn } from "@/components/ui/lib/utils";

export type HeroImage = { imageUrl: string; thumbUrl: string | null };

/**
 * A mosaic of the client's inventory at the head of the Homes tab: one large
 * lead photo and a run of smaller ones, so the portfolio reads as a place
 * before it reads as a grid. Purely a header; the roster below is the work.
 */
export function HomesHero({
  brandName,
  count,
  images,
}: {
  brandName: string;
  count: number;
  images: HeroImage[];
}) {
  const shots = images.slice(0, 5);
  if (shots.length === 0) return null;
  const [lead, ...rest] = shots;
  // Four secondary tiles fill the 2x2 to the right of the lead exactly, so the
  // mosaic never spills into a third row.
  const tiles = rest.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-2xl border">
      <div className="grid aspect-[16/9] grid-cols-1 gap-0.5 sm:aspect-[16/7] sm:grid-cols-4 sm:grid-rows-2">
        <div className="relative bg-muted sm:col-span-2 sm:row-span-2">
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={lead!.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        </div>
        {tiles.map((shot, index) => (
          <div key={index} className={cn("relative hidden bg-muted sm:block")}>
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={shot.thumbUrl ?? shot.imageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
            {index === tiles.length - 1 && count > shots.length ? (
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                +{count - shots.length}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
        <div className="text-sm font-semibold text-white">{brandName}</div>
        <div className="text-[11.5px] text-white/80">
          {count} {count === 1 ? "home" : "homes"} in the catalog
        </div>
      </div>
    </div>
  );
}
