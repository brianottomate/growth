import type { ReactNode } from "react";
import { Button } from "@wandercom/design-system-web/ui/button";
import { PropertyCard } from "@wandercom/design-system-web/blocks/property-card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

/** Editorial blocks shared by the Velite blog and the gated builder preview. */
export function ArticleNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="my-8 rounded-2xl border border-current/15 bg-current/5 p-6">
      <strong>{title}</strong>
      <div className="[&>p:last-child]:mb-0">{children}</div>
    </aside>
  );
}

export function ArticleSplit({
  image,
  alt,
  caption,
  imageSide = "right",
  children,
}: {
  image: string;
  alt: string;
  caption?: string;
  imageSide?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div className="my-10 grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      <div className={imageSide === "left" ? "md:order-2" : undefined}>
        {children}
      </div>
      <figure className="!m-0">
        {/* Editorial media may come from customer-owned hosts outside Next's image allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={alt}
          loading="lazy"
          className="!m-0 h-auto w-full rounded-2xl"
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    </div>
  );
}

export function ArticleBanner({
  image,
  alt,
  title,
  position = "50% 50%",
}: {
  image: string;
  alt: string;
  title: string;
  position?: string;
}) {
  return (
    <figure className="not-prose relative my-12 overflow-hidden rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={alt}
        loading="lazy"
        className="aspect-[16/10] w-full object-cover sm:aspect-[21/9]"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent p-6 sm:p-10">
        <h2 className="text-2xl font-semibold text-white sm:text-4xl">
          {title}
        </h2>
      </div>
    </figure>
  );
}

export type ArticleMedia = {
  src: string;
  alt: string;
  caption?: string;
  kind?: "image" | "video";
  poster?: string;
};

export function ArticleGallery({
  items,
  caption,
  layout = "natural",
}: {
  items: ArticleMedia[];
  caption?: string;
  layout?: "natural" | "stacked-left" | "stacked-right";
}) {
  if (!items.length) return null;
  const stacked = items.length === 3 && layout !== "natural";
  return (
    <figure className="my-8">
      <div
        className={`not-prose grid grid-cols-1 items-start gap-3 ${items.length > 1 ? "sm:grid-cols-2" : ""}`}
      >
        {stacked ? (
          <>
            <div
              className={`grid gap-3 ${layout === "stacked-right" ? "sm:order-2" : ""}`}
            >
              {items.slice(0, 2).map((item, index) => (
                <MediaTile key={`${item.src}-${index}`} item={item} />
              ))}
            </div>
            <MediaTile item={items[2]!} />
          </>
        ) : (
          items.map((item, index) => (
            <MediaTile key={`${item.src}-${index}`} item={item} />
          ))
        )}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function MediaTile({ item }: { item: ArticleMedia }) {
  return (
    <div>
      {item.kind === "video" ? (
        <video
          src={item.src}
          poster={item.poster}
          controls
          playsInline
          preload="metadata"
          className="h-auto w-full rounded-xl"
          aria-label={item.alt}
        />
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Enlarge image: ${item.alt}`}
              className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                className="h-auto w-full rounded-xl"
              />
            </button>
          </DialogTrigger>
          <DialogContent size="full" scrollable>
            <DialogClose asChild>
              <button
                type="button"
                className="self-end rounded-lg border border-current/20 px-3 py-2 text-sm md:hidden"
              >
                Close image
              </button>
            </DialogClose>
            <DialogTitle>{item.alt}</DialogTitle>
            <DialogDescription>
              {item.caption ?? "Expanded article image."}
            </DialogDescription>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.src}
              alt={item.alt}
              className="mx-auto max-h-[min(60dvh,calc(90dvh-10rem))] w-auto max-w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
      {item.caption ? (
        <p className="mt-2 text-sm text-secondary">{item.caption}</p>
      ) : null}
    </div>
  );
}

export type ArticlePlace = {
  name: string;
  note: string;
  href: string;
  linkLabel?: string;
  image?: string;
  alt?: string;
  status?: string;
  category?: string;
  location?: string;
  mapsHref?: string;
  websiteHref?: string;
};

export function ArticlePlaces({ places }: { places: ArticlePlace[] }) {
  return (
    <div className="not-prose my-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {places.map((place) => (
        <article
          key={place.href}
          className="flex items-start gap-4 rounded-2xl border border-current/15 p-4"
        >
          {place.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.image}
              alt={place.alt ?? place.name}
              loading="lazy"
              className="size-20 shrink-0 rounded-lg object-cover"
            />
          ) : null}
          <div className="min-w-0">
            {place.category || place.location ? (
              <p className="mb-1 text-xs text-secondary">
                {[place.category, place.location].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <h3 className="font-semibold">{place.name}</h3>
            {place.status ? (
              <p className="mt-1 text-xs font-medium">{place.status}</p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              {place.note}
            </p>
            <a
              href={place.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              {place.linkLabel ?? "View place"}
            </a>
            {place.mapsHref ? (
              <a
                href={place.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-4 inline-block text-sm underline underline-offset-4"
              >
                Map
              </a>
            ) : null}
            {place.websiteHref && place.websiteHref !== place.href ? (
              <a
                href={place.websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-4 inline-block text-sm underline underline-offset-4"
              >
                Website
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export type ArticleStop = {
  name: string;
  detail?: string;
  duration?: string;
  href?: string;
};

export function ArticleItinerary({
  title = "Trip itinerary",
  stops,
}: {
  title?: string;
  stops: ArticleStop[];
}) {
  return (
    <section
      className="not-prose my-8 rounded-2xl border border-current/15 p-6"
      aria-label={title}
    >
      <h3 className="mb-5 text-lg font-semibold">{title}</h3>
      <ol className="space-y-6">
        {stops.map((stop, index) => (
          <li key={`${stop.name}-${index}`} className="flex gap-4">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/20 text-sm"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {stop.href ? (
                  <a
                    href={stop.href}
                    className="font-semibold underline underline-offset-4"
                  >
                    {stop.name}
                  </a>
                ) : (
                  <span className="font-semibold">{stop.name}</span>
                )}
                {stop.duration ? (
                  <span className="text-sm text-secondary">
                    {stop.duration}
                  </span>
                ) : null}
              </div>
              {stop.detail ? (
                <p className="mt-2 text-sm leading-relaxed text-secondary">
                  {stop.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type ArticleLink = {
  name: string;
  href: string;
  label?: string;
  note?: string;
  image?: string;
  alt?: string;
  rating?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  location?: string | null;
};

/** Resource and property recommendations share a layout; notes explain the particular fit. */
export function ArticleLinks({ links }: { links: ArticleLink[] }) {
  return (
    <div className="not-prose @container my-8">
      <div className="grid grid-cols-1 gap-x-5 gap-y-8 @lg:grid-cols-2 @3xl:grid-cols-3">
        {links.map((link, index) =>
          link.image ? (
            <article key={`${link.href}-${index}`} className="min-w-0">
              <PropertyCard
                name={link.name}
                href={link.href}
                target="_blank"
                primaryActionLabel={`Explore ${link.name}`}
                images={[{ src: link.image, alt: link.alt ?? link.name }]}
                rating={link.rating}
                showRating={link.rating != null}
                showWishlist={false}
                isSwipeable={false}
                location={link.location}
                features={
                  link.bedrooms != null && link.bathrooms != null
                    ? { bedrooms: link.bedrooms, baths: link.bathrooms }
                    : null
                }
                badge={
                  link.label ? (
                    <span className="inline-flex rounded-full bg-black/30 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
                      {link.label}
                    </span>
                  ) : undefined
                }
                slots={{ root: "w-full", image: "rounded-2xl" }}
              />
              {link.note ? (
                <p className="mt-3 border-l-2 border-current/15 pl-3 text-sm leading-relaxed text-secondary">
                  {link.note}
                </p>
              ) : null}
            </article>
          ) : (
            <article
              key={`${link.href}-${index}`}
              className="rounded-2xl border border-current/15 p-5"
            >
              {link.label ? (
                <p className="text-xs text-secondary">{link.label}</p>
              ) : null}
              <h3 className="mt-2 text-lg font-semibold">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {link.name}
                </a>
              </h3>
              {link.note ? (
                <p className="mt-3 text-sm leading-relaxed text-secondary">
                  {link.note}
                </p>
              ) : null}
              <Button asChild size="md" className="mt-5">
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  Explore <span aria-hidden="true">↗</span>
                </a>
              </Button>
            </article>
          ),
        )}
      </div>
    </div>
  );
}

export function ArticleVideo({
  src,
  poster,
  title,
  caption,
}: {
  src: string;
  poster?: string;
  title: string;
  caption?: string;
}) {
  return (
    <figure className="not-prose my-8">
      <MediaTile item={{ src, poster, alt: title, caption, kind: "video" }} />
    </figure>
  );
}

export function ArticleYouTube({
  id,
  title,
  caption,
}: {
  id: string;
  title: string;
  caption?: string;
}) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;
  return (
    <figure className="not-prose my-8">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full rounded-xl border-0"
      />
      {caption ? (
        <figcaption className="mt-2 text-sm text-secondary">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ArticleHero({
  image,
  title,
  subtitle,
  position = "50% 50%",
  panorama = false,
  parallax = false,
}: {
  image: string;
  title: string;
  subtitle?: string;
  position?: string;
  panorama?: boolean;
  parallax?: boolean;
}) {
  return (
    <section
      aria-label={title}
      style={{
        backgroundImage: `url(${JSON.stringify(image)})`,
        backgroundPosition: position,
      }}
      className={`not-prose relative my-12 flex items-end overflow-hidden rounded-2xl bg-cover bg-scroll ${panorama ? "aspect-[3/1]" : "min-h-[45svh]"} ${parallax ? "motion-reduce:!bg-scroll md:bg-fixed" : ""}`}
    >
      <div className="w-full bg-gradient-to-t from-black/80 to-transparent p-6 pt-20 sm:p-10 sm:pt-28">
        <h2 className="text-3xl font-semibold text-white sm:text-5xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-3 text-lg text-white">{subtitle}</p>
        ) : null}
      </div>
    </section>
  );
}
