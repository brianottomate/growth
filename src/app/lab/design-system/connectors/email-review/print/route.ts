import { assertLabAccess } from "@/server/lab-access";
import { emailPreviewPrintDocument } from "@/server/services/email-preview-print";
import { clientReviewFixture } from "../fixture";
export async function GET(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;
  return new Response(emailPreviewPrintDocument(await clientReviewFixture()), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
