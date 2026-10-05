/** Resolve an explicitly selected, ready platform asset for this campaign audience. */
export type TargetableAsset = {
  id: string;
  name: string;
  externalId: string | null;
  audienceId: string | null;
  personaId: string | null;
  channel: { platform: string };
  linkedAudienceIds?: string[];
  seedMetadata?: { status: string } | null;
};

export function targetedAsset<T extends TargetableAsset>(
  audience: { id: string; personaId: string | null },
  assets: T[],
  platform: string,
): { asset: T; via: "audience" | "persona" } | null {
  const usable = assets.filter(
    (asset) =>
      asset.channel.platform === platform &&
      asset.externalId &&
      (!asset.seedMetadata || asset.seedMetadata.status === "ready"),
  );
  const direct = usable.find(
    (asset) =>
      asset.linkedAudienceIds?.includes(audience.id) ||
      asset.audienceId === audience.id,
  );
  if (direct) return { asset: direct, via: "audience" };
  return null;
}
