import "server-only";

import type { BrandIdentity } from "@/server/db/brand-schema";

export type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

/** The family a brand's cards are set in: the heading font, else the first. */
export function brandFontFamily(
  identity: BrandIdentity | null | undefined,
): string | null {
  const fonts = identity?.fonts ?? [];
  return (
    fonts.find((font) => font.role === "heading")?.family ??
    fonts[0]?.family ??
    null
  );
}

/**
 * Weight and url of every @font-face in a Google Fonts stylesheet whose
 * format satori can read: TrueType, OpenType or WOFF. WOFF2 is skipped.
 */
export function parseGoogleFontCss(
  css: string,
): Array<{ weight: number; url: string }> {
  const faces: Array<{ weight: number; url: string }> = [];
  for (const block of css.split("@font-face").slice(1)) {
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const url =
      /src:\s*url\(([^)]+)\)\s*format\(['"](?:truetype|opentype|woff)['"]\)/.exec(
        block,
      )?.[1];
    if (weight && url) faces.push({ weight: Number(weight), url });
  }
  return faces;
}

// satori takes raw font bytes and cannot read WOFF2, which is what Google
// serves modern browsers. An old Firefox user agent gets WOFF or TrueType.
const TTF_USER_AGENT =
  "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:22.0) Gecko/20130328 Firefox/22.0";

type CachedFace = {
  name: string;
  bytes: Uint8Array;
  weight: 400 | 700;
  style: "normal";
};

const cache = new Map<string, Promise<CachedFace[] | null>>();

/**
 * Regular and bold of a Google Fonts family, or null when Google does not
 * carry it (a licensed or self-hosted face), in which case the card renders
 * in the house font and nothing fails. Cached per process.
 */
export async function loadGoogleFont(
  family: string,
): Promise<LoadedFont[] | null> {
  const faces = await cachedFaces(family);
  if (!faces) return null;
  // satori consumes the buffer it is handed, so a cached face can only be
  // used once. Every caller gets its own copy; without this the second
  // render in a process silently loses the brand font.
  return faces.map((face) => ({
    name: face.name,
    weight: face.weight,
    style: face.style,
    data: face.bytes.slice().buffer as ArrayBuffer,
  }));
}

function cachedFaces(family: string): Promise<CachedFace[] | null> {
  const key = family.trim();
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = (async () => {
    try {
      const css = await fetch(
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(key).replace(/%20/g, "+")}:wght@400;700&display=swap`,
        {
          headers: { "User-Agent": TTF_USER_AGENT },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!css.ok) return null;
      const faces = parseGoogleFontCss(await css.text()).filter(
        (face) => face.weight === 400 || face.weight === 700,
      );
      if (faces.length === 0) return null;
      return Promise.all(
        faces.map(async (face) => ({
          name: key,
          bytes: new Uint8Array(
            await (
              await fetch(face.url, { signal: AbortSignal.timeout(8_000) })
            ).arrayBuffer(),
          ),
          weight: face.weight as 400 | 700,
          style: "normal" as const,
        })),
      );
    } catch (error) {
      console.error("brand font unavailable, using the house font", key, error);
      return null;
    }
  })();
  cache.set(key, pending);
  return pending;
}
