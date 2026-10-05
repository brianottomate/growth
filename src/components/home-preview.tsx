import Link from "next/link";
import { ImageOff } from "lucide-react";

export function HomePreview({
  href,
  name,
  imageUrl,
  location,
  facts,
  layout = "compact",
}: {
  href: string;
  name: string;
  imageUrl: string | null;
  location?: string;
  facts?: string;
  layout?: "compact" | "card";
}) {
  const compact = layout === "compact";
  return (
    <Link
      href={href}
      className={
        compact
          ? "group/home flex min-w-0 items-center gap-3"
          : "group/home block"
      }
    >
      <span
        className={
          compact
            ? "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
            : "flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground"
        }
      >
        {imageUrl ? (
          // oxlint-disable-next-line nextjs/no-img-element -- remote listing thumbnails
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover/home:opacity-90"
          />
        ) : (
          <ImageOff className="size-4" aria-label="No home photo" />
        )}
      </span>
      <span
        className={
          compact
            ? "min-w-0 space-y-0.5"
            : "block min-w-0 space-y-0.5 px-2.5 py-2"
        }
      >
        <span
          className="block truncate text-xs font-medium group-hover/home:underline"
          title={name}
        >
          {name}
        </span>
        {location && (
          <span
            className="block truncate text-[11px] text-muted-foreground"
            title={location}
          >
            {location}
          </span>
        )}
        {facts && (
          <span
            className="block truncate text-[11px] text-muted-foreground"
            title={facts}
          >
            {facts}
          </span>
        )}
      </span>
    </Link>
  );
}
