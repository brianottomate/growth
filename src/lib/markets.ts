import { z } from "zod";

// Where a brand's homes are, as guests think of it: one entry per market,
// each naming the place the way a guest would search for it, the towns its
// homes sit in, and what draws people there. Stored on the brand for now, in
// the shape a shared market row would take, so promoting it to a table is a
// copy. Only `label` and `towns` change what a card shows; the rest is
// context the copy and campaign prompts read.

export const marketSchema = z.object({
  id: z.string().min(1).max(60),
  /** How guests say it: "Hocking Hills, Ohio", "Louisville, KY", "Sonoma". */
  label: z.string().trim().min(1).max(40),
  /** The towns this market's homes sit in, as the listings name them. */
  towns: z.array(z.string().trim().min(1).max(60)).min(1).max(40),
  region: z.string().trim().max(60).optional(),
  /** Landmarks and attractions guests come for. */
  draws: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  seasons: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        when: z.string().trim().min(1).max(60),
        note: z.string().trim().max(160).optional(),
      }),
    )
    .max(8)
    .optional(),
  /** Where guests travel in from. */
  feederCities: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  gettingThere: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(600).optional(),
});
export type Market = z.infer<typeof marketSchema>;

export const brandMarketsSchema = z.object({
  markets: z.array(marketSchema).max(12),
  /** Set when an operator confirmed or edited the list; null while a draft. */
  confirmedAt: z.string().nullable().optional(),
  confirmedBy: z.string().nullable().optional(),
  draftedAt: z.string().optional(),
});
export type BrandMarkets = z.infer<typeof brandMarketsSchema>;

const norm = (town: string) => town.trim().toLowerCase();

/**
 * The market a home's town belongs to, once an operator confirmed the list:
 * a fresh draft never changes what a live card says.
 */
export function marketOf(
  markets: BrandMarkets | null | undefined,
  city: string | null | undefined,
): Market | null {
  if (!city || !markets?.confirmedAt) return null;
  const town = norm(city);
  return (
    markets.markets.find((market) =>
      market.towns.some((t) => norm(t) === town),
    ) ?? null
  );
}

/** A stable id from a label: "Hocking Hills, Ohio" → "hocking-hills-ohio". */
export function marketId(label: string) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "market"
  );
}
