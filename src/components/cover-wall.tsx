import Link from "next/link";

/**
 * Shared "document wall" primitive. A CoverItem is anything with a rendered
 * preview — a newsletter's email HTML, later a blog post's thumbnail/HTML.
 * `CoverWall` tiles them like a newsstand; `DocumentReader` stacks them to flip
 * through. Content-type-agnostic: pass `html` (scaled live render) or
 * `coverImage` (e.g. blog thumbnail).
 */
export type CoverItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string | null;
  date: string;
  badge?: { label: string; color: string };
  stat?: string;
  html?: string | null;
  coverImage?: string | null;
};

/** A scaled, non-interactive live render of arbitrary HTML — the "cover". */
function ScaledHtml({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      srcDoc={html}
      sandbox=""
      tabIndex={-1}
      loading="lazy"
      title={title}
      style={{
        width: "400%",
        height: "400%",
        transform: "scale(0.25)",
        transformOrigin: "top left",
        pointerEvents: "none",
        border: 0,
      }}
      className="absolute left-0 top-0"
    />
  );
}

function Cover({ item }: { item: CoverItem }) {
  return (
    <div className="bg-muted relative h-[300px] w-full overflow-hidden bg-white">
      {item.html ? (
        <ScaledHtml html={item.html} title={item.title} />
      ) : item.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImage}
          alt=""
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
          No preview
        </div>
      )}
    </div>
  );
}

export function CoverWall({ items }: { items: CoverItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.id}
          href={it.href}
          className="group bg-card hover:border-foreground/30 overflow-hidden rounded-xl border transition-colors"
        >
          <Cover item={it} />
          <div className="flex items-start gap-2 p-3">
            {it.badge && (
              <span
                className="mt-1 size-1.5 shrink-0 rounded-full"
                style={{ background: it.badge.color }}
                title={it.badge.label}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium group-hover:underline">
                {it.title}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[11px]">
                {it.date}
                {it.stat ? ` · ${it.stat}` : ""}
              </div>
              {it.subtitle && (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-snug">
                  {it.subtitle}
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DocumentReader({ items }: { items: CoverItem[] }) {
  return (
    <div className="flex flex-col gap-8">
      {items.map((it) => (
        <div key={it.id}>
          <div className="mb-2 flex items-center gap-2">
            {it.badge && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: it.badge.color }}
              />
            )}
            <span className="truncate text-sm font-medium">{it.title}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {it.date}
              {it.stat ? ` · ${it.stat}` : ""}
            </span>
            <Link
              href={it.href}
              className="text-muted-foreground hover:text-foreground ml-auto shrink-0 text-xs"
            >
              Open ↗
            </Link>
          </div>
          {it.html ? (
            <iframe
              srcDoc={it.html}
              sandbox=""
              loading="lazy"
              title={it.title}
              className="h-[80vh] w-full rounded-xl border bg-white"
            />
          ) : (
            <div className="text-muted-foreground rounded-xl border p-6 text-sm">
              No preview available.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
