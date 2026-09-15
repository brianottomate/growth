"use client";

import type {
  DatoBlock,
  KnownBlock,
} from "@/server/clients/datocms-cda.client";

// Block renderers for the draft preview. These intentionally mirror
// wander.com's src/app/(blog)/article/[slug]/_components/Article_Content/
// structuredText.tsx so the preview shows what the site will show. Real React
// elements — no HTML strings, no dangerouslySetInnerHTML.

// Keep in sync with wander.com's BlogVideoEmbed.
const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/;
const CLOUDFLARE_UID =
  /(?:cloudflarestream\.com|videodelivery\.net)\/([\w-]{20,})/;
const CLOUDFLARE_CUSTOMER = "qmayhafe7iottqnh";

/** Player src for a stored video URL, or null if we don't recognize it. */
export function videoSrc(url: string): string | null {
  const yt = YOUTUBE_ID.exec(url)?.[1];
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const cf = CLOUDFLARE_UID.exec(url)?.[1];
  if (cf)
    return `https://customer-${CLOUDFLARE_CUSTOMER}.cloudflarestream.com/${cf}/iframe`;
  return null;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-8 aspect-video w-full overflow-hidden rounded-xl bg-muted">
      {children}
    </div>
  );
}

export function PreviewBlock({ block }: { block: DatoBlock }) {
  // Narrow once: the incoming type also allows models added to the body since
  // this file was written, which the switch's default case reports.
  const known = block as KnownBlock;

  if (known.__typename === "VideoEmbedRecord") {
    const url = known.url ?? "";
    const src = url ? videoSrc(url) : null;
    if (!src) {
      return (
        <p className="text-sm text-muted-foreground italic">
          Unrecognized video URL: {url}
        </p>
      );
    }
    return (
      <Frame>
        <iframe
          src={src}
          title="Video player"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="size-full border-0"
        />
      </Frame>
    );
  }

  if (known.__typename === "BlogImageRecord") {
    const image = known.image;
    if (!image?.url) return null;
    return (
      // oxlint-disable-next-line nextjs/no-img-element -- Dato CDN host isn't in next/image remotePatterns; a preview doesn't need optimization
      <img
        src={image.url}
        alt={image.alt ?? ""}
        className="my-8 w-full rounded-xl"
      />
    );
  }

  if (known.__typename === "TableRecord") {
    const table = known.table as {
      columns?: string[];
      data?: Record<string, string>[];
    } | null;
    if (!table?.columns?.length) return null;
    return (
      <div className="my-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column}
                  className="border-b px-3 py-2 text-left font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table.data ?? []).map((row, index) => (
              <tr key={index}>
                {Object.values(row).map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b px-3 py-2 text-muted-foreground"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Visible rather than silent: a preview that hides content is worse than one
  // that admits it can't draw it.
  return (
    <p className="text-sm text-muted-foreground italic">
      [{block.__typename} — not rendered in preview]
    </p>
  );
}
