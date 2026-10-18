/** Isolated branch rehearsal. Provider runs are completed with synthetic results. */
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  organizationTable,
  userTable,
  productionPacketTable,
  articleRevisionTable,
  workflowRunTable,
  mediaAssetTable,
} from "@/server/db/schema";
import { emptyCreativeDocument } from "@/lib/creative-document";
import {
  createCreativeDocument,
  saveCreativeDocument,
  getCreativeDocument,
  beginDocumentRun,
  claimDocumentRun,
  finishDocumentRun,
  cancelDocumentRun,
} from "@/server/services/creative-document.service";
import {
  articleHistory,
  acceptCurrentArticle,
  readArticleRevision,
  applyArticleRevision,
  dismissArticleCandidate,
} from "@/server/services/article-history.service";
assert.equal(process.env.DB_EXPERIMENT_BRANCH, "experiment/article-history");
assert(process.env.ARTICLE_TEST_HOST);
assert.equal(
  new URL(process.env.DATABASE_URL!).hostname,
  process.env.ARTICLE_TEST_HOST,
);
const baseline = await db.execute<{ missing: number }>(
  sql`select count(*)::integer as missing from production_packet p where p.document_type='article' and not exists(select 1 from article_revision r where r.document_id=p.id and r.source='baseline' and r.document=p.document)`,
);
assert.equal(
  baseline.rows[0]?.missing,
  0,
  "Existing articles preserved by migration",
);
const nonce = crypto.randomUUID();
const [org, foreign] = await db
  .insert(organizationTable)
  .values([
    { name: "Article QA", slug: `article-qa-${nonce}` },
    { name: "Foreign article QA", slug: `article-foreign-${nonce}` },
  ])
  .returning();
const [user] = await db.select({ id: userTable.id }).from(userTable).limit(1);
assert(org && foreign && user);
const [brand, otherBrand] = await db
  .insert(brandTable)
  .values([
    { name: "Article QA brand", organizationId: org.id },
    { name: "Foreign article QA brand", organizationId: foreign.id },
  ])
  .returning();
assert(brand && otherBrand);
const identity = { organizationId: org.id, userId: user.id };
const original = emptyCreativeDocument("article", "Original article");
assert(original.type === "article");
original.content.bodyMarkdown = "Original working draft";
original.content.datoItemId = "existing-cms-item";
const packet = await createCreativeDocument({
  ...identity,
  brandId: brand.id,
  title: "Article QA",
  document: original,
});
const input = { ...identity, documentId: packet.id };
const edited = structuredClone(original);
edited.content.bodyMarkdown = "Operator's first edit";
await saveCreativeDocument({ ...input, document: edited });
let history = await articleHistory(packet.id, org.id);
assert.equal(history.revisions.length, 1);
const old = await readArticleRevision({
  ...input,
  revisionId: history.revisions[0]!.id,
});
assert.equal(old.document.content.bodyMarkdown, original.content.bodyMarkdown);
// LWW saves of older input remain allowed, with recovery for the overwritten draft.
await saveCreativeDocument({ ...input, document: original });
const manual = await acceptCurrentArticle({ ...input, reviewed: original });
assert(
  (await articleHistory(packet.id, org.id)).acceptance?.revisionId ===
    manual.revisionId,
);
await saveCreativeDocument({ ...input, document: edited });
assert.equal((await articleHistory(packet.id, org.id)).acceptance, null);
await assert.rejects(
  acceptCurrentArticle({ ...input, reviewed: original }),
  /changed/,
);
await saveCreativeDocument({ ...input, document: original });
assert.equal(
  (await getCreativeDocument(packet.id, org.id)).document.type,
  "article",
);
const run = await beginDocumentRun({
  ...input,
  operation: "write",
  provider: "internal",
  model: "synthetic",
});
await claimDocumentRun(run.id);
const candidate = structuredClone(original);
candidate.content.bodyMarkdown = "Synthetic generated article";
candidate.content.datoItemId = "stale-cms-item";
await assert.rejects(
  saveCreativeDocument({ ...input, document: edited }),
  /being produced/,
);
assert(await finishDocumentRun(run.id, candidate));
assert.equal(await finishDocumentRun(run.id, candidate), false);
let current = await getCreativeDocument(packet.id, org.id);
assert(current.document.type === "article");
assert.equal(
  current.document.content.bodyMarkdown,
  original.content.bodyMarkdown,
  "Generation must not overwrite current draft",
);
history = await articleHistory(packet.id, org.id);
const pending = history.revisions.find((r) => r.status === "candidate");
assert(pending);
await assert.rejects(articleHistory(packet.id, foreign.id));
await assert.rejects(
  readArticleRevision({
    organizationId: foreign.id,
    documentId: packet.id,
    revisionId: pending.id,
  }),
);
await assert.rejects(
  applyArticleRevision({
    ...input,
    organizationId: foreign.id,
    revisionId: pending.id,
    mode: "accept",
  }),
);
await assert.rejects(
  applyArticleRevision({ ...input, revisionId: pending.id, mode: "restore" }),
  /Review/,
);
const accepted = await Promise.all(
  [0, 1].map(() =>
    applyArticleRevision({ ...input, revisionId: pending.id, mode: "accept" }),
  ),
);
assert.equal(accepted.filter((r) => r.applied).length, 1);
current = await getCreativeDocument(packet.id, org.id);
assert(current.document.type === "article");
assert.equal(
  current.document.content.bodyMarkdown,
  candidate.content.bodyMarkdown,
);
assert.equal(current.document.content.datoItemId, "existing-cms-item");
assert.equal(
  (await articleHistory(packet.id, org.id)).acceptance?.revisionId,
  pending.id,
);
// A CMS push updates provider identity while retaining the editorial decision.
const push = await beginDocumentRun({
  ...input,
  operation: "push",
  provider: "datocms",
  model: "synthetic",
});
await claimDocumentRun(push.id);
await finishDocumentRun(push.id, current.document);
assert.equal(
  (await articleHistory(packet.id, org.id)).acceptance?.revisionId,
  pending.id,
);
await saveCreativeDocument({ ...input, document: edited });
assert.equal((await articleHistory(packet.id, org.id)).acceptance, null);
assert.equal(
  (
    await applyArticleRevision({
      ...input,
      revisionId: pending.id,
      mode: "accept",
    })
  ).applied,
  false,
);
current = await getCreativeDocument(packet.id, org.id);
assert(current.document.type === "article");
assert.equal(
  current.document.content.bodyMarkdown,
  edited.content.bodyMarkdown,
);
await applyArticleRevision({ ...input, revisionId: old.id, mode: "restore" });
current = await getCreativeDocument(packet.id, org.id);
assert(current.document.type === "article");
assert.equal(
  current.document.content.bodyMarkdown,
  original.content.bodyMarkdown,
);
assert(
  (await articleHistory(packet.id, org.id)).revisions.some(
    (r) => r.source === "before_restore",
  ),
);
// CMS pull keeps its explicit overwrite behavior and saves the prior draft.
const pull = await beginDocumentRun({
  ...input,
  operation: "pull",
  provider: "datocms",
  model: "synthetic",
});
await claimDocumentRun(pull.id);
await finishDocumentRun(pull.id, edited);
current = await getCreativeDocument(packet.id, org.id);
assert(current.document.type === "article");
assert.equal(
  current.document.content.bodyMarkdown,
  edited.content.bodyMarkdown,
);
assert(
  (await articleHistory(packet.id, org.id)).revisions.some(
    (r) => r.source === "before_pull",
  ),
);
// Late cancelled runs produce no candidate.
const cancelled = await beginDocumentRun({
  ...input,
  operation: "write",
  provider: "internal",
  model: "synthetic",
});
await claimDocumentRun(cancelled.id);
await cancelDocumentRun(cancelled.id, org.id);
assert.equal(await finishDocumentRun(cancelled.id, candidate), false);
const [asset] = await db
  .insert(mediaAssetTable)
  .values({
    brandId: otherBrand.id,
    provider: "r2",
    kind: "image",
    status: "ready",
    title: "Foreign QA image",
  })
  .returning();
assert(asset);
const unsafe = structuredClone(original);
unsafe.content.heroAssetId = asset.id;
const [unsafeRevision] = await db
  .insert(articleRevisionTable)
  .values({
    documentId: packet.id,
    document: unsafe,
    source: "generated",
    status: "candidate",
  })
  .returning();
assert(unsafeRevision);
await assert.rejects(
  applyArticleRevision({
    ...input,
    revisionId: unsafeRevision.id,
    mode: "accept",
  }),
  /belonging to this brand/,
);
await dismissArticleCandidate({ ...input, revisionId: unsafeRevision.id });
await assert.rejects(
  applyArticleRevision({
    ...input,
    revisionId: unsafeRevision.id,
    mode: "accept",
  }),
  /pending candidate/,
);
await db
  .update(brandTable)
  .set({ organizationId: foreign.id })
  .where(eq(brandTable.id, brand.id));
await assert.rejects(articleHistory(packet.id, org.id));
await assert.rejects(getCreativeDocument(packet.id, org.id));
await db
  .update(brandTable)
  .set({ organizationId: org.id, deletedAt: new Date() })
  .where(eq(brandTable.id, brand.id));
await assert.rejects(articleHistory(packet.id, org.id));
await db
  .update(brandTable)
  .set({ deletedAt: null })
  .where(eq(brandTable.id, brand.id));
// History pagination does not strand early drafts.
await db.insert(articleRevisionTable).values(
  Array.from({ length: 52 }, () => ({
    documentId: packet.id,
    document: original,
    source: "pagination",
  })),
);
const page = await articleHistory(packet.id, org.id);
assert(page.nextCursor);
assert.equal(page.revisions.length, 50);
const older = await articleHistory(packet.id, org.id, page.nextCursor);
assert(older.revisions.some((r) => r.id === old.id));
await db
  .delete(workflowRunTable)
  .where(eq(workflowRunTable.packetId, packet.id));
await db
  .delete(productionPacketTable)
  .where(eq(productionPacketTable.id, packet.id));
await db.delete(organizationTable).where(eq(organizationTable.id, org.id));
await db.delete(organizationTable).where(eq(organizationTable.id, foreign.id));
console.log(
  "Article baseline, candidate isolation, atomic acceptance, LWW recovery, CMS identity, cancellation, ownership and history pagination passed.",
);
