/** Ad-account IDs arrive with and without Meta's `act_` prefix. */
export const sameMetaAccount = (a: string, b: string) =>
  a.replace(/^act_/, "") === b.replace(/^act_/, "");

/**
 * A seed uploads to its owner brand's one pinned Meta destination. The same
 * Meta account can be allowlisted under several brands, so the local row must
 * be the owner's, never another brand's row for it.
 */
export function pickSeedDestination<
  T extends { adAccountId: string; connectionAccountId: string },
>(input: {
  owner: { id: string; name: string };
  listed: T[];
  allowed: { id: string; brandId: string | null; externalId: string }[];
}) {
  if (input.listed.length !== 1)
    throw new Error(
      `Pin exactly one allowlisted Meta destination on ${input.owner.name}; its seeds upload there`,
    );
  const target = input.listed[0]!;
  const local = input.allowed.find(
    (a) =>
      a.brandId === input.owner.id &&
      sameMetaAccount(a.externalId, target.adAccountId),
  );
  if (!local)
    throw new Error(
      `${input.owner.name}'s Meta destination is no longer allowlisted`,
    );
  return { ...target, localAdAccountId: local.id };
}
