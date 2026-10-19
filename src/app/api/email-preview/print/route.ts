import { ORPCError } from "@orpc/server";
import { getSession } from "@/server/better-auth/server";
import { getWanderMembership } from "@/server/wander-workspace";
import { createEmailPreviewInput } from "@/lib/email-client-preview";
import { loadOwnedEmailPrint } from "@/server/services/email-client-preview.service";
import { emailPreviewPrintDocument } from "@/server/services/email-preview-print";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user)
    return new Response("Sign in to export emails.", { status: 401 });
  const membership = await getWanderMembership(session.user.id);
  if (!membership)
    return new Response("Workspace access required.", { status: 403 });
  const query = new URL(request.url).searchParams;
  const input = createEmailPreviewInput
    .omit({ expiresInDays: true })
    .safeParse({
      brandId: query.get("brandId"),
      platformPostIds: query.getAll("email"),
    });
  if (!input.success)
    return new Response("Choose up to 24 emails to export.", { status: 400 });
  try {
    const preview = await loadOwnedEmailPrint(
      membership.organizationId,
      input.data.brandId,
      input.data.platformPostIds,
    );
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
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND")
      return new Response("These emails are not available in your workspace.", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
}
