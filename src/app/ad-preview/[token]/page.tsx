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
 * Links read the campaign's current approved ads and a frozen catalog export,
 * optionally limited to selected homes. Returning an ad to Studio removes it
 * from this page. Rotating the brand connect token revokes its preview links.
 * Browser PNG/PDF exports include the selected catalog's full home list;
 * the Satori sheet is a compact overview with shortened copy and carousels.
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
  const imageUrl = (src: string | null) =>
    src?.startsWith("https://")
      ? `/ad-preview/${token}/media?u=${encodeURIComponent(src)}`
      : src;
  return (
    <AdPreviewBoard
      token={token}
      preview={{
        ...preview,
        brandLogo: imageUrl(preview.brandLogo),
        campaign: preview.campaign && {
          ...preview.campaign,
          ads: preview.campaign.ads.map((ad) =>
            ad.kind === "creative"
              ? {
                  ...ad,
                  placements: ad.placements.map((placement) => ({
                    ...placement,
                    media: placement.media.map((media) => ({
                      ...media,
                      url:
                        media.type === "image"
                          ? imageUrl(media.url)!
                          : media.url,
                      thumbnail: imageUrl(media.thumbnail ?? null),
                    })),
                  })),
                }
              : ad,
          ),
        },
        catalog: preview.catalog && {
          ...preview.catalog,
          cards: preview.catalog.cards.map((card) => ({
            ...card,
            image: imageUrl(card.image)!,
          })),
        },
      }}
    />
  );
}
