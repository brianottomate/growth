/** Isolated-branch rehearsal: ownership boundaries and atomic draft acceptance. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  organizationTable,
  brandTable,
  brandInspirationTable,
  platformPostTable,
  mediaAssetTable,
  userTable,
  contentPostTable,
  adTable,
  referenceBoardTable,
} from "@/server/db/schema";
import * as boards from "@/server/services/reference-board.service";
import { requireVisibleBrand } from "@/server/ai/capabilities/brand-access";
import { boardDetailSchema, type BoardProposal } from "@/lib/reference-board";

assert.equal(process.env.DB_EXPERIMENT_BRANCH, "experiment/reference-boards");
assert(process.env.BOARDS_TEST_HOST);
assert.equal(
  new URL(process.env.DATABASE_URL!).hostname,
  process.env.BOARDS_TEST_HOST,
);
const nonce = crypto.randomUUID();
const [user] = await db.select({ id: userTable.id }).from(userTable).limit(1);
assert(user);
const [org, otherOrg] = await db
  .insert(organizationTable)
  .values([
    { name: "Board QA", slug: `board-qa-${nonce}` },
    { name: "Other Board QA", slug: `other-board-qa-${nonce}` },
  ])
  .returning();
assert(org && otherOrg);
const [brand, other, reference] = await db
  .insert(brandTable)
  .values([
    {
      name: "Board QA brand",
      organizationId: org.id,
      slug: `board-brand-${nonce}`,
    },
    {
      name: "Other board QA brand",
      organizationId: otherOrg.id,
      slug: `other-board-brand-${nonce}`,
    },
    { name: "Shared public reference", slug: `board-ref-${nonce}` },
  ])
  .returning();
assert(brand && other && reference);
// Insert the other organization's tracking row first: both must be authorized.
await db.insert(brandInspirationTable).values([
  { brandId: other.id, inspirationBrandId: reference.id },
  { brandId: brand.id, inspirationBrandId: reference.id },
]);
for (const orgId of [org.id, otherOrg.id])
  await requireVisibleBrand(reference.id, {
    orgId,
    userId: user.id,
    surface: "test",
    runId: nonce,
  });
const [post, privatePost] = await db
  .insert(platformPostTable)
  .values([
    {
      brandId: reference.id,
      platform: "instagram",
      text: "Synthetic public reference",
      publishedAt: new Date(),
      status: "published",
      source: "scraped",
    },
    {
      brandId: other.id,
      platform: "instagram",
      text: "Synthetic private reference",
      publishedAt: new Date(),
      status: "published",
      source: "owned",
    },
  ])
  .returning();
assert(post && privatePost);
const [asset, privateAsset] = await db
  .insert(mediaAssetTable)
  .values([
    {
      brandId: brand.id,
      provider: "r2",
      kind: "image",
      status: "ready",
      reviewStatus: "approved",
      title: "QA owned image",
      url: "https://example.com/owned.png",
    },
    {
      brandId: other.id,
      provider: "r2",
      kind: "image",
      status: "ready",
      reviewStatus: "approved",
      title: "QA foreign image",
      url: "https://example.com/foreign.png",
    },
  ])
  .returning();
assert(asset && privateAsset);
let detail = await boards.saveReferenceBoard(org.id, {
  brandId: brand.id,
  name: "QA reference board",
  brief: "Synthetic creative QA",
  archived: false,
});
const boardId = detail.board.id;
await assert.rejects(boards.getReferenceBoard(otherOrg.id, boardId));
await assert.rejects(
  boards.saveReferenceBoard(otherOrg.id, {
    id: boardId,
    brandId: brand.id,
    name: "Hijack",
    brief: "",
    archived: false,
  }),
);
await assert.rejects(
  boards.addBoardReference(org.id, {
    boardId,
    source: { kind: "post", id: privatePost.id },
    note: "",
  }),
);
await assert.rejects(
  boards.addBoardReference(org.id, {
    boardId,
    source: { kind: "media", id: privateAsset.id },
    note: "",
  }),
);
await boards.addBoardReference(org.id, {
  boardId,
  source: { kind: "post", id: post.id },
  note: "First occurrence",
});
await boards.addBoardReference(org.id, {
  boardId,
  source: { kind: "post", id: post.id },
  note: "Second occurrence",
});
detail = await boards.addBoardReference(org.id, {
  boardId,
  source: { kind: "media", id: asset.id },
  note: "Owned reference",
});
assert.equal(detail.references.length, 3);
const first = detail.references[0]!;
const last = detail.references[2]!;
detail = await boards.editBoardReferences(org.id, {
  boardId,
  entries: [{ id: first.id, note: "Latest note" }],
});
assert.equal(detail.references[0]?.note, "Latest note");
detail = await boards.editBoardReferences(org.id, {
  boardId,
  entries: [{ id: last.id }],
  reorder: true,
});
assert.equal(detail.references[0]?.id, last.id);
assert.equal(
  detail.references.find((r) => r.id === first.id)?.note,
  "Latest note",
);
const proposal: BoardProposal = {
  kind: "content",
  title: "QA original idea",
  hook: "Original hook",
  copy: "Original direction",
  visualDirection: "Use owned artwork",
  cta: "Explore",
  rationale: "A synthetic example",
  referenceIds: [first.id, last.id],
};
detail = await boards.saveBoardProposal(org.id, {
  boardId,
  document: proposal,
});
const proposalId = detail.proposals[0]!.id;
const changed = { ...proposal, title: "QA edited idea" };
await boards.saveBoardProposal(org.id, {
  boardId,
  id: proposalId,
  document: changed,
});
await assert.rejects(
  boards.acceptBoardProposal(org.id, user.id, {
    boardId,
    id: proposalId,
    reviewed: proposal,
  }),
  /changed/,
);
// Ordinary saves remain last-write-wins, even when submitted from an older view.
await boards.saveBoardProposal(org.id, {
  boardId,
  id: proposalId,
  document: proposal,
});
const accepted = await Promise.all(
  [0, 1].map(() =>
    boards.acceptBoardProposal(org.id, user.id, {
      boardId,
      id: proposalId,
      reviewed: proposal,
    }),
  ),
);
const draftUrl = accepted[0]!.proposals.find(
  (p) => p.id === proposalId,
)!.draftUrl;
assert(draftUrl);
assert.equal(
  draftUrl,
  accepted[1]!.proposals.find((p) => p.id === proposalId)!.draftUrl,
);
const draftId = draftUrl.split("/").at(-1)!;
await db
  .update(contentPostTable)
  .set({ title: "Operator's later edit" })
  .where(eq(contentPostTable.id, draftId));
await boards.acceptBoardProposal(org.id, user.id, {
  boardId,
  id: proposalId,
  reviewed: changed,
});
const saved = await db.query.contentPostTable.findFirst({
  where: eq(contentPostTable.id, draftId),
});
assert.equal(saved?.title, "Operator's later edit");
assert.equal(saved?.status, "draft");
assert.equal(saved?.media, null);
await assert.rejects(
  boards.saveBoardProposal(org.id, {
    boardId,
    id: proposalId,
    document: changed,
  }),
  /accepted/,
);
// Later private ownership redacts reference content, and prevents accepting a new proposal.
await db
  .update(brandTable)
  .set({ organizationId: otherOrg.id })
  .where(eq(brandTable.id, reference.id));
detail = await boards.getReferenceBoard(org.id, boardId);
assert.equal(detail.references.find((r) => r.id === first.id)?.view, null);
assert.equal(detail.references.find((r) => r.id === first.id)?.source, null);
await assert.rejects(
  boards.saveBoardProposal(org.id, { boardId, document: proposal }),
  /unavailable/,
);
await db
  .update(brandTable)
  .set({ organizationId: null })
  .where(eq(brandTable.id, reference.id));
const adProposal = { ...proposal, kind: "ad" as const, title: "QA ad shell" };
detail = await boards.saveBoardProposal(org.id, {
  boardId,
  document: adProposal,
});
const adProposalId = detail.proposals.find((p) => p.document.kind === "ad")!.id;
detail = await boards.acceptBoardProposal(org.id, user.id, {
  boardId,
  id: adProposalId,
  reviewed: adProposal,
});
const adUrl = detail.proposals.find((p) => p.id === adProposalId)!.draftUrl;
assert(adUrl?.startsWith(`/app/performance/clients/${brand.slug}/ads#ad-`));
const adId = adUrl!.split("#ad-")[1]!;
const ad = await db.query.adTable.findFirst({ where: eq(adTable.id, adId) });
assert.equal(ad?.brandId, brand.id);
assert.equal(ad?.campaignId, null);
assert.equal(ad?.status, "drawn");
assert(ad && "media" in ad.content);
assert.equal(ad.content.media.length, 0);
await db.delete(adTable).where(eq(adTable.id, adId));
detail = await boards.acceptBoardProposal(org.id, user.id, {
  boardId,
  id: adProposalId,
  reviewed: adProposal,
});
assert(detail.proposals.find((p) => p.id === adProposalId)?.acceptedAt);
assert.equal(
  detail.proposals.find((p) => p.id === adProposalId)?.draftUrl,
  null,
);
assert.equal(
  (await db.select().from(adTable).where(eq(adTable.brandId, brand.id))).length,
  0,
);
await boards.saveReferenceBoard(org.id, { ...detail.board, archived: true });
await assert.rejects(
  boards.saveBoardProposal(org.id, { boardId, document: proposal }),
  /Restore/,
);
await boards.saveReferenceBoard(org.id, { ...detail.board, archived: false });
await db
  .update(brandTable)
  .set({ deletedAt: new Date() })
  .where(eq(brandTable.id, brand.id));
await assert.rejects(boards.getReferenceBoard(org.id, boardId));
await assert.rejects(
  requireVisibleBrand(reference.id, {
    orgId: org.id,
    userId: user.id,
    surface: "test",
    runId: nonce,
  }),
);
await db
  .update(brandTable)
  .set({ deletedAt: null })
  .where(eq(brandTable.id, brand.id));
boardDetailSchema.parse(await boards.getReferenceBoard(org.id, boardId));
// Keep a single harmless board in the real workspace for authenticated rendering checks.
const [workspaceBrand] = await db
  .select()
  .from(brandTable)
  .where(eq(brandTable.slug, "wander"))
  .limit(1);
if (workspaceBrand?.organizationId) {
  const qa = await boards.saveReferenceBoard(workspaceBrand.organizationId, {
    brandId: workspaceBrand.id,
    name: "Reference board preview QA",
    brief: "Synthetic preview record. No delivery or provider actions.",
    archived: false,
  });
  console.log(JSON.stringify({ previewBoardId: qa.board.id }));
}
await db.delete(referenceBoardTable).where(eq(referenceBoardTable.id, boardId));
await db.delete(brandTable).where(eq(brandTable.id, reference.id));
await db.delete(organizationTable).where(eq(organizationTable.id, org.id));
await db.delete(organizationTable).where(eq(organizationTable.id, otherOrg.id));
console.log(
  "Reference board ownership, last-write-wins, reviewed acceptance, concurrency and draft preservation passed.",
);
