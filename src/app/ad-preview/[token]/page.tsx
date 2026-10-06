import type { Metadata } from "next";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { loadAdPreviewPage } from "@/server/services/ad-preview.service";

import { AdPreviewBoard } from "./AdPreviewBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Ad preview · Wander" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * A client's read-only preview of their approved ads, in the placements they
 * will run in. No login and no session: the signed token in the URL is the
 * credential, and the page never reads or creates a Growth session. Light
 * theme, because the mocks imitate light feeds and the page is saved to PDF
 * from the browser as often as it is opened.
 *
 * Suggested next steps, in order:
 *
 * 1. Revocable links. The token is stateless (brand, ads, expiry, HMAC), so a
 *    link cannot be killed before it expires short of rotating
 *    BETTER_AUTH_SECRET. An `ad_preview_link` row holding a sha256 of the
 *    token, `expiresAt` and `revokedAt` fixes that and lists sent links
 *    in the studio. It is also the parent the next two items need.
 * 2. Client decisions. Approve / request changes per ad, signed with a name
 *    the client types once (kept in localStorage). Record the decision
 *    against a snapshot of what the page drew (stored per ad when the link is
 *    made), not the live ad, and lapse it when the ad changes, the same way
 *    `catalogCardFingerprint` lapses a catalog approval.
 * 3. Comments. A table with `authorName` text and no user FK, per ad or for
 *    the whole set, capped per link. Do NOT reach for Better Auth anonymous
 *    sessions here: sign-up is gated to @wander.com, `user.create.after`
 *    auto-joins every new user to the Wander org, and `protectedProcedure`
 *    (~280 procedures), /lab and several API routes treat any session as a
 *    teammate. The token stays the only credential.
 * 4. One-click PDF/PNG. Today the operator or client uses the browser's
 *    "Save as PDF". wander.com's pitch export (`src/features/pitchExport`)
 *    shows the server path: playwright-core + @sparticuz/chromium. Here it is
 *    simpler, because this page is server-rendered from the token, so the
 *    headless browser can load `/ad-preview/<token>` directly and print it,
 *    with no DOM capture or asset inlining.
 * 5. Catalog and Google display. Catalog cards can reuse
 *    `CatalogCollectionPreview` once its card URLs are frozen to R2; catalog
 *    ad copy is not covered by the card fingerprint, so gate it first.
 */
export default async function AdPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await loadAdPreviewPage(token);
  if (!preview)
    return (
      <main
        data-theme="light"
        className="grid min-h-screen place-items-center bg-surface-primary px-6 text-primary"
      >
        <div className="max-w-sm text-center">
          <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
          <h1 className="text-xl font-semibold">
            This link is no longer active
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask your Wander contact for a fresh preview link.
          </p>
        </div>
      </main>
    );
  return <AdPreviewBoard token={token} preview={preview} />;
}
