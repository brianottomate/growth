import {
  adPreviewImageUrls,
  loadAdPreviewPage,
} from "@/server/services/ad-preview.service";

const MAX_BYTES = 15 * 1024 * 1024;

/** Each link's servable URLs, briefly, so an export is not a query per image. */
const allowedByToken = new Map<string, { urls: Set<string>; at: number }>();

async function allowedUrls(token: string) {
  const hit = allowedByToken.get(token);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.urls;
  const preview = await loadAdPreviewPage(token);
  if (!preview) return null;
  const urls = adPreviewImageUrls(preview);
  if (allowedByToken.size > 200) allowedByToken.clear();
  allowedByToken.set(token, { urls, at: Date.now() });
  return urls;
}

/**
 * Same-origin copies of a preview's images, so the browser can draw them
 * into a PNG export. R2 sends no CORS headers, and a canvas that draws a
 * cross-origin image cannot be read back. Only URLs that belong to this
 * link's ads are served: this is not an open proxy.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const src = new URL(request.url).searchParams.get("u");
  const allowed = src ? await allowedUrls(token) : null;
  if (!src || !allowed?.has(src)) return new Response(null, { status: 404 });

  const upstream = await fetch(src, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  const size = Number(upstream?.headers.get("content-length") ?? 0);
  if (!upstream?.ok || !type.startsWith("image/") || size > MAX_BYTES)
    return new Response(null, { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
