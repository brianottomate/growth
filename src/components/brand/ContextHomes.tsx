import Link from "next/link";

export type ContextHome = {
  id: string;
  name: string;
  city?: string | null;
  imageUrl?: string | null;
  href?: string;
};
/** A consistent, inspectable inventory reference for strategy cards. */
export function ContextHomes({
  homes,
  label = "Homes",
  reason,
}: {
  homes: ContextHome[];
  label?: string;
  reason?: string | null;
}) {
  if (!homes.length) return null;
  return (
    <details className="group rounded-xl border bg-background p-3">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm focus-visible:outline-ring">
        <span className="flex -space-x-2" aria-hidden="true">
          {homes
            .slice(0, 4)
            .map((home) =>
              home.imageUrl ? (
                <img
                  key={home.id}
                  src={home.imageUrl}
                  alt=""
                  className="size-9 rounded-lg border-2 border-background object-cover"
                  loading="lazy"
                />
              ) : null,
            )}
        </span>
        <span className="font-medium">
          {homes.length} {label.toLowerCase()}
        </span>
        <span className="ml-auto text-muted-foreground group-open:rotate-180">
          ⌄
        </span>
      </summary>
      {reason && <p className="mt-3 text-sm text-muted-foreground">{reason}</p>}
      <ul className="mt-3 grid grid-cols-1 gap-2 @xl:grid-cols-2">
        {homes.map((home) => (
          <li key={home.id} className="min-w-0 text-sm">
            {home.href ? (
              <Link
                href={home.href}
                className="underline decoration-border underline-offset-4"
              >
                {home.name}
              </Link>
            ) : (
              home.name
            )}
            {home.city && (
              <span className="block text-xs text-muted-foreground">
                {home.city}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
