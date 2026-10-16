import { strict as assert } from "node:assert";
import { expect, test } from "bun:test";
import { uploadSeedBatches } from "./upload-batches";

test("a failed upload resumes the frozen membership prefix without creating or double-hashing users", async () => {
  const hashes = Array.from({ length: 27584 }, (_, i) =>
    i.toString(16).padStart(64, "0"),
  );
  const page = async (after: string | undefined) => {
    const start = after ? hashes.indexOf(after) + 1 : 0;
    const rows = hashes.slice(start, start + 10000);
    return {
      hashes: rows,
      nextAfterHash: start + rows.length < hashes.length ? rows.at(-1)! : null,
    };
  };
  const resolve = async (rows: string[]) =>
    rows.map((h) => ({ email: `contact-${h}@example.invalid` }));
  let confirmed = 0,
    calls = 0;
  await assert.rejects(
    uploadSeedBatches({
      alreadyUploaded: 0,
      page,
      resolve,
      send: async (users) => {
        if (++calls === 2) throw new Error("transport failed");
        return { numReceived: users.length, numInvalid: 0 };
      },
      progress: async (n) => {
        confirmed = n;
      },
    }),
    /transport failed/,
  );
  expect(confirmed).toBe(10000);
  const resumed: string[] = [];
  await uploadSeedBatches({
    alreadyUploaded: confirmed,
    page,
    resolve,
    send: async (users) => {
      resumed.push(...users.map((u) => u.email));
      return { numReceived: users.length, numInvalid: 0 };
    },
    progress: async (n) => {
      confirmed = n;
    },
  });
  expect(confirmed).toBe(27584);
  expect(resumed).toHaveLength(17584);
  expect(new Set(resumed).size).toBe(17584);
  expect(resumed[0]).toBe(`contact-${hashes[10000]}@example.invalid`);
});
test("invalid, partial or missing provider acknowledgments never advance upload progress", async () => {
  for (const response of [
    { numReceived: 1, numInvalid: 1 },
    { numReceived: 0, numInvalid: 0 },
    {},
  ]) {
    let confirmed = 0;
    await assert.rejects(
      uploadSeedBatches({
        alreadyUploaded: 0,
        page: async () => ({ hashes: ["a".repeat(64)], nextAfterHash: null }),
        resolve: async () => [{ email: "contact@example.invalid" }],
        send: async () => response,
        progress: async (n) => {
          confirmed = n;
        },
      }),
    );
    expect(confirmed).toBe(0);
  }
});
