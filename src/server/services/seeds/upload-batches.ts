import { z } from "zod";

export class SeedAcknowledgmentError extends Error {}

const acknowledgment = z.object({
  numReceived: z.number().int().nonnegative(),
  numInvalid: z.number().int().nonnegative(),
});
/** A snapshot is an immutable ordered set. Resume only its acknowledged prefix. */
export async function uploadSeedBatches(input: {
  alreadyUploaded: number;
  page: (
    afterHash: string | undefined,
  ) => Promise<{ hashes: string[]; nextAfterHash: string | null }>;
  resolve: (hashes: string[]) => Promise<{ email: string }[]>;
  send: (users: { email: string }[]) => Promise<Record<string, unknown>>;
  progress: (uploaded: number) => Promise<void>;
}) {
  let uploaded = input.alreadyUploaded,
    skipped = 0,
    afterHash: string | undefined;
  while (true) {
    const page = await input.page(afterHash);
    const remaining = page.hashes.slice(Math.max(0, uploaded - skipped));
    if (remaining.length) {
      const users = await input.resolve(remaining);
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
    skipped += page.hashes.length;
    if (!page.nextAfterHash) break;
    afterHash = page.nextAfterHash;
  }
  return uploaded;
}
