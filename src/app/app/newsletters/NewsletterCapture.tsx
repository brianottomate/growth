import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  channelTable,
  platformPostTable,
} from "@/server/db/schema";
import { inspirationAddress } from "@/lib/inbound-email";
import {
  CompetitorNewsletters,
  type CompetitorNewsletterRow,
} from "./CompetitorNewsletters";

export async function NewsletterCapture({
  brands,
  brand,
}: {
  brands: { id: string }[];
  brand: { id: string; name: string } | null;
}) {
  const brandIds = brand ? [brand.id] : brands.map((row) => row.id);
  // ---- Competitor newsletters (forwarded via inspo+<brandId>@) ----
  // The reference brands our owned brands track, their newsletter-capture
  // channel (if provisioned), and the issues forwarded in so far.
  const inspirations = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
      })
    : [];
  const refBrandIds = [
    ...new Set(inspirations.map((i) => i.inspirationBrandId)),
  ];
  const refBrands = refBrandIds.length
    ? await db.query.brandTable.findMany({
        where: and(
          inArray(brandTable.id, refBrandIds),
          isNull(brandTable.deletedAt),
        ),
      })
    : [];
  const nlChannels = refBrandIds.length
    ? await db.query.channelTable.findMany({
        where: and(
          inArray(channelTable.brandId, refBrandIds),
          eq(channelTable.kind, "newsletter"),
          isNull(channelTable.deletedAt),
        ),
      })
    : [];
  const trackedSet = new Set(nlChannels.map((c) => c.brandId));
  const refIssues = refBrandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, refBrandIds),
          eq(platformPostTable.externalKind, "broadcast"),
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
      })
    : [];
  const competitorRows: CompetitorNewsletterRow[] = refBrands
    .map((b) => {
      const bIssues = refIssues.filter((i) => i.brandId === b.id);
      return {
        brandId: b.id,
        name: b.name,
        logo: b.logo,
        website: b.website,
        tracked: trackedSet.has(b.id),
        address: inspirationAddress(b.id),
        issueCount: bIssues.length,
        lastReceivedAt: bIssues[0]?.publishedAt?.toISOString() ?? null,
        recentIssues: bIssues.slice(0, 3).map((i) => ({
          id: i.id,
          subject: i.text ?? "Untitled",
          receivedAt: i.publishedAt?.toISOString() ?? "",
          url: i.externalUrl ?? null,
          themes:
            (i.metadata as { inspiration?: { themes?: string[] } } | null)
              ?.inspiration?.themes ?? [],
        })),
      };
    })
    .sort(
      (a, b) =>
        Number(b.tracked) - Number(a.tracked) || b.issueCount - a.issueCount,
    );

  return (
    <CompetitorNewsletters
      rows={competitorRows}
      own={
        brand
          ? { name: brand.name, address: inspirationAddress(brand.id) }
          : null
      }
    />
  );
}
