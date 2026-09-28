/**
 * Which platform audience a campaign audience's ad set will target on one
 * platform. Mirrors the push (platformAudienceExternalIdFor): an asset linked
 * to the campaign audience itself wins, then the asset bought for its
 * persona, and only assets with a platform id count.
 */
export type TargetableAsset = {
  id: string;
  name: string;
  externalId: string | null;
  audienceId: string | null;
  personaId: string | null;
  channel: { platform: string };
};

export function targetedAsset<T extends TargetableAsset>(
  audience: { id: string; personaId: string | null },
  assets: T[],
  platform: string,
): { asset: T; via: "audience" | "persona" } | null {
  const usable = assets.filter(
    (asset) => asset.channel.platform === platform && asset.externalId,
  );
  const direct = usable.find((asset) => asset.audienceId === audience.id);
  if (direct) return { asset: direct, via: "audience" };
  const persona = audience.personaId
    ? usable.find((asset) => asset.personaId === audience.personaId)
    : undefined;
  return persona ? { asset: persona, via: "persona" } : null;
}
