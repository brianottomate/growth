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
