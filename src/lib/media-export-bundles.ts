import { z } from "zod";
const provenance = z.object({
  adId: z.string(),
  sourceVersion: z.string(),
  adName: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  campaignName: z.string().optional(),
  shape: z.string(),
  cardId: z.string(),
});
export function mediaExportProvenance(metadata: unknown) {
  const result = z.object({ adApproval: provenance }).safeParse(metadata);
  return result.success ? result.data.adApproval : null;
}
/** Each approval is a distinct bundle. Ordinary media never joins a bundle. */
export function groupMediaExports<T extends { id: string; metadata: unknown }>(
  assets: T[],
) {
  const entries: {
    key: string;
    assets: T[];
    approval: ReturnType<typeof mediaExportProvenance>;
  }[] = [];
  const bundles = new Map<string, (typeof entries)[number]>();
  for (const asset of assets) {
    const approval = mediaExportProvenance(asset.metadata);
    if (!approval) {
      entries.push({ key: asset.id, assets: [asset], approval: null });
      continue;
    }
    const key = JSON.stringify([
      approval.campaignId ?? null,
      approval.adId,
      approval.sourceVersion,
    ]);
    const existing = bundles.get(key);
    if (existing) existing.assets.push(asset);
    else {
      const entry = { key, assets: [asset], approval };
      bundles.set(key, entry);
      entries.push(entry);
    }
  }
  return entries;
}
