import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";

export type BandHome = {
  name: string;
  imageUrl: string;
  thumbUrl: string | null;
};

const MIN_SET = 3;
const MAX_SET = 10;

/**
 * The homes currently in focus: the picked set, shown as a rich band at the
 * top of the Homes tab. The grid below is how the set is chosen; this is what
 * it adds up to, with the way on to the ads.
 */
export function PickedBand({
  homes,
  count,
  adsHref,
}: {
  homes: BandHome[];
  count: number;
  adsHref: string;
}) {
  const ready = count >= MIN_SET;
  return (
    <section className="space-y-2.5 rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-baseline gap-2 text-[11.5px]">
          <span className="font-semibold tracking-wide text-muted-foreground uppercase">
            In focus
          </span>
          <span
            className={cn(ready ? "text-emerald-400" : "text-muted-foreground")}
          >
            {count}/{MAX_SET}
            {count < MIN_SET ? " · pick at least three" : ""}
          </span>
        </span>
        {ready ? (
          <ButtonLink href={adsHref} size="sm" className="h-7">
            Continue to Ads
          </ButtonLink>
        ) : null}
      </div>
      {homes.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          No homes in focus yet. Tick homes below to build the set the ads run
          on.
        </p>
      ) : (
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
          {homes.map((home, index) => (
            <li
              key={index}
              className="relative w-44 shrink-0 snap-start overflow-hidden rounded-xl border bg-muted"
            >
              <div className="relative aspect-[4/3]">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={home.thumbUrl ?? home.imageUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
                  <div className="truncate text-[11.5px] font-medium text-white">
                    {home.name}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
