export type CampaignWorkspace = "brand" | "performance";

export function campaignListPath(
  brandSlug: string,
  workspace: CampaignWorkspace = "brand",
) {
  return workspace === "performance"
    ? `/app/performance/clients/${encodeURIComponent(brandSlug)}/campaigns`
    : `/app/brands/${encodeURIComponent(brandSlug)}/ads`;
}

export function campaignPath(
  brandSlug: string,
  campaignId: string,
  workspace: CampaignWorkspace = "brand",
) {
  return `${campaignListPath(brandSlug, workspace)}/${encodeURIComponent(campaignId)}`;
}

/** A readable label for the generated house convention; custom names stay intact. */
export function campaignDisplayName(name: string): string {
  const match =
    /^META_(?:PERF\+)?[A-Z0-9+]+_SALES_PURCHASE_(\d{4})(0[1-9]|1[0-2])(?:_([a-z0-9]+(?:_[a-z0-9]+)*))?$/.exec(
      name,
    );
  if (!match) return name;
  const month = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const suffix = match[3]
    ? ` · ${match[3]
        .split("_")
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(" ")}`
    : "";
  return `Sales · ${month}${suffix}`;
}
