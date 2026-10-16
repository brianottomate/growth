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
 * Seed customer lists always live in Wander's own ad account, whichever brand
 * owns the seed. The same Meta account is allowlisted under several brands, so
 * the local row must be the Wander brand's, never a client's row for it.
 */
export function pickSeedDestination<
  T extends { adAccountId: string; connectionAccountId: string },
>(input: {
  wanderBrandId: string;
  listed: T[];
  allowed: { id: string; brandId: string | null; externalId: string }[];
}) {
  if (input.listed.length !== 1)
    throw new Error(
      "Pin exactly one allowlisted Meta destination on the Wander brand; seeds upload only to Wander's account",
    );
  const target = input.listed[0]!;
  const local = input.allowed.find(
    (a) =>
      a.brandId === input.wanderBrandId &&
      sameMetaAccount(a.externalId, target.adAccountId),
  );
  if (!local)
    throw new Error("Wander's Meta destination is no longer allowlisted");
  return { ...target, localAdAccountId: local.id };
}
