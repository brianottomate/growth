import { cn } from "@/components/ui/lib/utils";

/** Saved creative mark previews, shared by the identity section. */
export function BrandMarkCard({
  variants,
  photo,
}: {
  variants: { color: string; white: string; dark: string };
  photo: string | null;
}) {
  return (
    <div id="brand-mark" className="grid grid-cols-1 gap-3 @md:grid-cols-3">
      <Swatch label="Color" src={variants.color} className="bg-white" />
      <Swatch label="White" src={variants.white} className="bg-neutral-900" />
      <Swatch
        label={photo ? "On photo" : "Dark"}
        src={photo ? variants.white : variants.dark}
        photo={photo}
        className={photo ? "bg-neutral-700" : "bg-white"}
      />
    </div>
  );
}

function Swatch({
  label,
  src,
  photo,
  className,
}: {
  label: string;
  src: string;
  photo?: string | null;
  className: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "flex h-24 items-center justify-center bg-cover bg-center p-4",
          className,
        )}
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      >
        {src ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={src}
            alt={`${label} brand mark`}
            className="max-h-10 max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            Preview unavailable
          </span>
        )}
      </div>
    </div>
  );
}
