import { z } from "zod";

export class SeedAcknowledgmentError extends Error {}

export type SeedUploadUser = { email?: string; phone?: string };

const acknowledgment = z.object({
  numReceived: z.number().int().nonnegative(),
  numInvalid: z.number().int().nonnegative(),
});
/** A snapshot is an immutable ordered set. Resume only its acknowledged prefix. */
export async function uploadSeedBatches(input: {
  alreadyUploaded: number;
  page: (
    afterHash: string | undefined,
  ) => Promise<{ users: SeedUploadUser[]; nextAfterHash: string | null }>;
  send: (users: SeedUploadUser[]) => Promise<Record<string, unknown>>;
  progress: (uploaded: number) => Promise<void>;
}) {
  let uploaded = input.alreadyUploaded,
    skipped = 0,
    afterHash: string | undefined;
  while (true) {
    const page = await input.page(afterHash);
    const users = page.users.slice(Math.max(0, uploaded - skipped));
    if (users.length) {
      const result = acknowledgment.safeParse(await input.send(users));
      if (
        !result.success ||
        result.data.numInvalid > 0 ||
        result.data.numReceived !== users.length
      )
        throw new SeedAcknowledgmentError(
          "Provider did not acknowledge the complete identifier batch",
        );
      uploaded += users.length;
      await input.progress(uploaded);
    }
    skipped += page.users.length;
    if (!page.nextAfterHash) break;
    afterHash = page.nextAfterHash;
  }
  return uploaded;
}

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
