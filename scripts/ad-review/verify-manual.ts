import { strict as assert } from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { homeTable, memberTable, platformPostTable } from "@/server/db/schema";
import {
  catalogState,
  editCatalogCard,
  setCatalogApproval,
  setCatalogReady,
} from "@/server/services/catalog-studio.service";
import { ContentService } from "@/server/services/content.service";
import { createId } from "@/server/db/utils";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Disposable database only");
const brand = await db.query.brandTable.findFirst({
  where: (b, { eq }) => eq(b.slug, "hollyhock-suites"),
});
assert(brand?.organizationId);
const member = await db.query.memberTable.findFirst({
  where: eq(memberTable.organizationId, brand.organizationId),
});
assert(member);
const actor = { userId: member.userId, brandId: brand.id };
const state = await catalogState(actor.userId, actor.brandId);
const card = state.draft?.cards[0];
assert(card);
await setCatalogApproval({
  ...actor,
  approved: false,
  cards: [{ homeId: card.homeId }],
});
await setCatalogReady({ ...actor, ready: true, homeIds: [card.homeId] });
await editCatalogCard({
  ...actor,
  homeId: card.homeId,
  patch: { title: "Manual review test" },
});
let row = await db.query.homeTable.findFirst({
  where: (h, { and, eq }) =>
    and(eq(h.brandId, brand.id), eq(h.externalId, card.homeId)),
});
assert(row?.catalogReadyAt);
assert.equal(row.catalogReadyBy, member.userId);
await setCatalogApproval({
  ...actor,
  approved: true,
  cards: [{ homeId: card.homeId }],
});
await assert.rejects(
  () =>
    editCatalogCard({
      ...actor,
      homeId: card.homeId,
      patch: { title: "Blocked" },
      force: true,
    }),
  /Reopen/,
);
await assert.rejects(
  () =>
    editCatalogCard({
      ...actor,
      homeId: card.homeId,
      patch: { adHeadline: "Blocked" },
    }),
  /Reopen/,
);
await setCatalogApproval({
  ...actor,
  approved: false,
  cards: [{ homeId: card.homeId }],
});
await editCatalogCard({
  ...actor,
  homeId: card.homeId,
  patch: { title: "Reopened" },
});
row = await db.query.homeTable.findFirst({ where: eq(homeTable.id, row.id) });
assert.equal(row?.catalogReadyAt, null);
assert.equal(row?.catalogTitle, "Reopened");
const id = createId("ppost");
await db.insert(platformPostTable).values({
  id,
  brandId: brand.id,
  platform: "instagram",
  source: "owned",
  status: "pending_review",
  text: "Draft",
});
await ContentService.updatePlatformDraft({
  platformPostId: id,
  text: "Edited while ready",
});
let post = await db.query.platformPostTable.findFirst({
  where: eq(platformPostTable.id, id),
});
assert.equal(post?.status, "pending_review");
await ContentService.updatePlatformDraft({
  platformPostId: id,
  status: "approved",
});
await assert.rejects(
  () =>
    ContentService.updatePlatformDraft({ platformPostId: id, text: "Blocked" }),
  /Reopen/,
);
await assert.rejects(
  () => ContentService.setSpotMedia({ platformPostId: id, media: [] }),
  /Reopen/,
);
await ContentService.updatePlatformDraft({
  platformPostId: id,
  status: "draft",
});
await ContentService.updatePlatformDraft({
  platformPostId: id,
  text: "Reopened",
});
post = await db.query.platformPostTable.findFirst({
  where: eq(platformPostTable.id, id),
});
assert.equal(post?.text, "Reopened");
await db.delete(platformPostTable).where(eq(platformPostTable.id, id));
console.log("Catalog and social manual review transitions passed");
