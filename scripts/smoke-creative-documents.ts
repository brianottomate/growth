/** Explicit live-service smoke. Creates one temporary packet, calls no providers, and cleans up. */
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../src/server/db";
import {
  brandTable,
  memberTable,
  productionPacketTable,
  creativeRunTable,
} from "../src/server/db/schema";
import { emptyCreativeDocument } from "../src/lib/creative-document";
import {
  beginDocumentRun,
  cancelDocumentRun,
  claimDocumentRun,
  createCreativeDocument,
  failDocumentRun,
  finishDocumentRun,
  getCreativeDocument,
  saveCreativeDocument,
} from "../src/server/services/creative-document.service";

if (!process.argv.includes("--run"))
  throw new Error(
    "Pass --run to create and clean up a temporary live test document. No providers are called.",
  );
const [membership] = await db
  .select({
    organizationId: brandTable.organizationId,
    brandId: brandTable.id,
    userId: memberTable.userId,
  })
  .from(brandTable)
  .innerJoin(
    memberTable,
    eq(memberTable.organizationId, brandTable.organizationId),
  )
  .limit(1);
if (!membership?.organizationId) throw new Error("No workspace member found");
const owner = { ...membership, organizationId: membership.organizationId };
const document = emptyCreativeDocument(
  "article",
  "Temporary lock verification",
);
if (document.type !== "article") throw new Error("Expected article");
document.content.bodyMarkdown = "Keep this successful draft";
const packet = await createCreativeDocument({
  ...owner,
  title: "Temporary lock verification — automatically removed",
  document,
});
const input = { ...owner, documentId: packet.id };
const runInput = {
  ...input,
  provider: "smoke",
  model: "none",
  operation: "verify",
};
try {
  const starts = await Promise.allSettled([
    beginDocumentRun(runInput),
    beginDocumentRun(runInput),
  ]);
  assert.equal(
    starts.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one concurrent producer can acquire the document",
  );
  const started = starts.find((r) => r.status === "fulfilled");
  assert(started?.status === "fulfilled");
  assert(await claimDocumentRun(started.value.id));
  assert.equal(
    await claimDocumentRun(started.value.id),
    undefined,
    "A worker cannot claim twice",
  );
  await assert.rejects(
    saveCreativeDocument({ ...input, document }),
    /being produced/,
  );
  await assert.rejects(
    getCreativeDocument(packet.id, "org_not_the_owner"),
    /not found/,
  );
  await cancelDocumentRun(started.value.id, owner.organizationId);
  assert.equal(
    await finishDocumentRun(started.value.id, {
      ...document,
      content: { ...document.content, bodyMarkdown: "Late result" },
    }),
    false,
  );
  assert.deepEqual(
    (await getCreativeDocument(packet.id, owner.organizationId)).document,
    document,
    "Cancellation preserves the last good draft",
  );
  const failed = await beginDocumentRun(runInput);
  await claimDocumentRun(failed.id);
  await failDocumentRun(failed.id, new Error("Simulated provider failure"));
  assert.deepEqual(
    (await getCreativeDocument(packet.id, owner.organizationId)).document,
    document,
  );
  const expired = await beginDocumentRun(runInput);
  await claimDocumentRun(expired.id);
  await db
    .update(creativeRunTable)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(creativeRunTable.id, expired.id));
  await saveCreativeDocument({ ...input, document });
  assert.equal(await finishDocumentRun(expired.id, document), false);
  console.log(
    "PASS: single producer, single claim, backend edit lock, workspace boundary, cancellation, failure preservation, timeout recovery and late-result rejection.",
  );
} finally {
  await db
    .delete(creativeRunTable)
    .where(
      and(
        eq(creativeRunTable.packetId, packet.id),
        eq(creativeRunTable.organizationId, owner.organizationId),
      ),
    );
  await db
    .delete(productionPacketTable)
    .where(
      and(
        eq(productionPacketTable.id, packet.id),
        eq(productionPacketTable.organizationId, owner.organizationId),
      ),
    );
  console.log("Temporary document and runs removed.");
}
