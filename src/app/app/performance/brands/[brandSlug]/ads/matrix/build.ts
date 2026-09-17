import type { AdCreativeContent, AdPlacements } from "@/server/db/ads-schema";
import { compositionTitle, coverage, resolveMatrix } from "@/lib/ad-placements";
import { adFormatOf, AD_FORMAT_LABEL } from "@/lib/performance-ads";

import type { MatrixAd, MatrixHome } from "./PlacementMatrix";

/** One drafted ad as `listAdSet` returns it; only what the matrix reads. */
export type MatrixAdRow = {
  id: string;
  name: string;
  status: string;
  content: unknown;
  placements?: AdPlacements | null;
  homeId: string | null;
  home?: { externalId: string; name: string } | null;
};

/**
 * The drafted set as home groups the matrix draws: every home a group, every
 * ad three or more rows, every placement a live-resolved cell.
 */
export function toMatrixHomes(ads: MatrixAdRow[]): MatrixHome[] {
  const groups = new Map<string, MatrixHome>();
  for (const ad of ads) {
    const content = ad.content as AdCreativeContent;
    if (!Array.isArray(content.media) || content.media.length === 0) continue;
    const homeKey = ad.home?.externalId ?? ad.homeId ?? "unbound";

    const resolved = resolveMatrix({ content, placements: ad.placements });
    const matrixAd: MatrixAd = {
      id: ad.id,
      name: ad.name,
      format: AD_FORMAT_LABEL[adFormatOf(content)],
      status: ad.status === "approved" ? "approved" : "drawn",
      base: {
        headline: content.headline,
        body: content.body,
        callToAction: content.callToAction ?? null,
      },
      photoOnly: content.photoOnly ?? false,
      coverage: coverage(resolved),
      // The source photos behind the compositions, and the line each draws,
      // for the card editor.
      sourceCards: content.media.map((card) => ({
        assetId: card.assetId ?? null,
        thumbnail: card.thumbnail ?? null,
        url: card.url,
        type: card.type,
        title: compositionTitle(card.url),
        composed: card.url.includes("/api/compositions/preview"),
      })),
      cells: resolved.map((cell) => ({
        key: cell.key,
        label: cell.spec.label,
        shortLabel: cell.spec.shortLabel,
        surface: cell.spec.surface,
        crop: cell.spec.crop,
        state: cell.state,
        fitIssues: cell.fit.issues,
        frozenAt: cell.frozenAt,
        copy: {
          headline: cell.copy.headline,
          body: cell.copy.body,
          callToAction: cell.copy.callToAction,
        },
        cards: cell.cards.map((card) => ({
          url: card.url,
          thumbnail: card.thumbnail,
          type: card.type,
        })),
      })),
    };

    const group = groups.get(homeKey);
    if (group) group.ads.push(matrixAd);
    else {
      groups.set(homeKey, {
        key: homeKey,
        name: ad.home?.name ?? "Not bound to a home",
        ads: [matrixAd],
      });
    }
  }
  return [...groups.values()];
}
