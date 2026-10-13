import {
  loadPerformanceReportPage,
  performanceReportImageUrls,
} from "@/server/services/performance-report.service";
import { previewImage } from "@/server/services/ad-preview-image";

/**
 * Same-origin copies of a report's images, so the browser can draw them into
 * a PNG export (R2 sends no CORS headers). Only URLs stored on this report
 * are served: this is not an open proxy.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const src = new URL(request.url).searchParams.get("u");
  const report = src ? await loadPerformanceReportPage(token) : null;
  if (!src || !report || !performanceReportImageUrls(report).has(src))
    return new Response(null, { status: 404 });

  const image = await previewImage(src).catch(() => null);
  if (!image) return new Response(null, { status: 502 });
  return new Response(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
