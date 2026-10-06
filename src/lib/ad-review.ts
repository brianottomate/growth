/**
 * Where an ad stands in review, as the cards show it. drawn is a draft, ready
 * is marked done by its author, approved is final. Dates travel as strings so
 * server rows and client props agree.
 */
export type AdReview = {
  status: "drawn" | "ready" | "approved";
  readyAt: string | null;
  readyBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  replacesAdId: string | null;
};

export function adReviewOf(ad: {
  status: string;
  readyAt?: Date | null;
  readyBy?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  replacesAdId?: string | null;
}): AdReview {
  return {
    status:
      ad.status === "approved" || ad.status === "ready" ? ad.status : "drawn",
    readyAt: ad.readyAt?.toISOString() ?? null,
    readyBy: ad.readyBy ?? null,
    approvedAt: ad.approvedAt?.toISOString() ?? null,
    approvedBy: ad.approvedBy ?? null,
    replacesAdId: ad.replacesAdId ?? null,
  };
}
