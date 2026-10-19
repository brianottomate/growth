import { loadEmailClientPreview } from "@/server/services/email-client-preview.service";
import { emailPreviewPrintDocument } from "@/server/services/email-preview-print";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params,
    preview = await loadEmailClientPreview(token);
  if (!preview)
    return new Response("This email preview link is no longer active.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(emailPreviewPrintDocument(preview), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
