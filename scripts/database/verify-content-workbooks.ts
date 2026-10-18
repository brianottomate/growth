/** High-value rehearsal: lost work, unauthorized mappings and duplicate application. */
import assert from "node:assert/strict";
import { eq, and, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import {
  organizationTable,
  brandTable,
  userTable,
  memberTable,
  seriesTable,
  initiativeTable,
  contentPostTable,
  platformPostTable,
  contentWorkbookTable,
} from "@/server/db/schema";
import {
  importWorkbook,
  getWorkbook,
  saveWorkbook,
  applyWorkbook,
} from "@/server/services/content-workbook.service";
import { parseContentWorkbook } from "@/server/services/content-workbook-parse";
assert.equal(process.env.DB_EXPERIMENT_BRANCH, "experiment/content-workbooks");
assert(process.env.WORKBOOK_TEST_HOST);
assert.equal(
  new URL(process.env.DATABASE_URL!).hostname,
  process.env.WORKBOOK_TEST_HOST,
);
const nonce = crypto.randomUUID();
const [org, foreign] = await db
  .insert(organizationTable)
  .values([
    { name: "Workbook QA", slug: `workbook-qa-${nonce}` },
    { name: "Foreign workbook QA", slug: `workbook-foreign-${nonce}` },
  ])
  .returning();
const [user] = await db.select({ id: userTable.id }).from(userTable).limit(1);
assert(org && foreign && user);
await db
  .insert(memberTable)
  .values({ organizationId: org.id, userId: user.id });
const [brand, other] = await db
  .insert(brandTable)
  .values([
    { organizationId: org.id, name: "Workbook QA brand" },
    { organizationId: foreign.id, name: "Foreign workbook QA brand" },
  ])
  .returning();
assert(brand && other);
try {
  const source = {
    name: "Synthetic plan",
    kind: "csv" as const,
    data: 'Title,Platform,Caption,Date,Idea key,Hook\nWeekend,instagram,"First line\nSecond line, with comma",2026-11-02,weekend,Open the door\nWeekend,tiktok,Separate caption,2026-11-03,weekend,Open the door',
  };
  let book = await importWorkbook(org.id, user.id, brand.id, source);
  assert.equal(
    book.document.rows[0]!.caption,
    "First line\nSecond line, with comma",
  );
  assert.equal(book.issues.length, 0);
  await assert.rejects(getWorkbook(foreign.id, book.id));
  await assert.rejects(importWorkbook(org.id, user.id, other.id, source));
  const original = structuredClone(book.document);
  const edited = structuredClone(original);
  edited.rows[0]!.caption = "Edited caption";
  await saveWorkbook(org.id, book.id, edited);
  await saveWorkbook(org.id, book.id, original);
  assert.equal(
    (await getWorkbook(org.id, book.id)).document.rows[0]!.caption,
    original.rows[0]!.caption,
    "LWW saves remain allowed",
  );
  await saveWorkbook(org.id, book.id, edited);
  await assert.rejects(
    applyWorkbook(org.id, user.id, book.id, original),
    /changed/,
  );
  book = await saveWorkbook(org.id, book.id, original);
  const [a, b] = await Promise.all([
    applyWorkbook(org.id, user.id, book.id, book.document),
    applyWorkbook(org.id, user.id, book.id, book.document),
  ]);
  assert.equal(a.results.length, 2);
  assert.deepEqual(a.results, b.results);
  assert.equal(new Set(a.results.map((r) => r.contentPostId)).size, 1);
  const postId = a.results[0]!.contentPostId!;
  const spots = await db
    .select()
    .from(platformPostTable)
    .where(eq(platformPostTable.contentPostId, postId));
  assert.equal(spots.length, 2);
  assert.equal(
    spots.find((s) => s.platform === "tiktok")?.text,
    "Separate caption",
  );
  assert(spots.every((s) => s.status === "draft" && !s.deliveryExternalId));
  await db
    .update(contentPostTable)
    .set({ title: "Later operator edit" })
    .where(eq(contentPostTable.id, postId));
  await applyWorkbook(org.id, user.id, book.id, edited);
  assert.equal(
    (
      await db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, postId),
      })
    )?.title,
    "Later operator edit",
  );
  await assert.rejects(saveWorkbook(org.id, book.id, edited), /applied/);
  const mapping = await importWorkbook(org.id, user.id, brand.id, source);
  const [series] = await db
    .insert(seriesTable)
    .values({ brandId: other.id, name: "Foreign series" })
    .returning();
  assert(series);
  mapping.document.rows.forEach((r) => (r.seriesId = series.id));
  await saveWorkbook(org.id, mapping.id, mapping.document);
  await assert.rejects(
    applyWorkbook(org.id, user.id, mapping.id, mapping.document),
    /series/,
  );
  mapping.document.rows.forEach((r) => (r.seriesId = ""));
  const [initiative] = await db
    .insert(initiativeTable)
    .values({ organizationId: foreign.id, name: "Foreign initiative" })
    .returning();
  assert(initiative);
  mapping.document.initiativeId = initiative.id;
  await saveWorkbook(org.id, mapping.id, mapping.document);
  await assert.rejects(
    applyWorkbook(org.id, user.id, mapping.id, mapping.document),
    /initiative/,
  );
  const single = {
    name: "Slot plan",
    kind: "tsv" as const,
    data: "Title\tPlatform\tFormat\tCaption\tDate\nSlot fill\tinstagram\tinstagram.image\tReviewed caption\t2026-11-04",
  };
  const [slot] = await db
    .insert(contentPostTable)
    .values({
      brandId: brand.id,
      title: "Empty slot",
      status: "slot",
      slotKind: "cadence",
    })
    .returning();
  assert(slot);
  const [slotSpot] = await db
    .insert(platformPostTable)
    .values({
      brandId: brand.id,
      contentPostId: slot.id,
      platform: "instagram",
      format: "instagram.image",
      source: "owned",
      status: "slot",
    })
    .returning();
  assert(slotSpot);
  let fill = await importWorkbook(org.id, user.id, brand.id, single);
  fill.document.rows[0]!.slotId = slot.id;
  fill = await saveWorkbook(org.id, fill.id, fill.document);
  await db
    .update(contentPostTable)
    .set({ ctaText: "Operator CTA" })
    .where(eq(contentPostTable.id, slot.id));
  await assert.rejects(
    applyWorkbook(org.id, user.id, fill.id, fill.document),
    /contains work/,
  );
  await db
    .update(contentPostTable)
    .set({ ctaText: null })
    .where(eq(contentPostTable.id, slot.id));
  await db
    .update(platformPostTable)
    .set({ text: "Work in progress" })
    .where(eq(platformPostTable.id, slotSpot.id));
  await assert.rejects(
    applyWorkbook(org.id, user.id, fill.id, fill.document),
    /existing copy/,
  );
  assert.equal((await getWorkbook(org.id, fill.id)).appliedAt, null);
  await db
    .update(platformPostTable)
    .set({ text: null })
    .where(eq(platformPostTable.id, slotSpot.id));
  const filled = await applyWorkbook(org.id, user.id, fill.id, fill.document);
  assert.equal(filled.results[0]?.contentPostId, slot.id);
  assert.equal(filled.results[0]?.platformPostId, slotSpot.id);
  const moved = await importWorkbook(org.id, user.id, brand.id, single);
  await db
    .update(brandTable)
    .set({ organizationId: foreign.id })
    .where(eq(brandTable.id, brand.id));
  await assert.rejects(getWorkbook(org.id, moved.id));
  await assert.rejects(
    applyWorkbook(org.id, user.id, moved.id, moved.document),
  );
  await db
    .update(brandTable)
    .set({ organizationId: org.id, deletedAt: new Date() })
    .where(eq(brandTable.id, brand.id));
  await assert.rejects(getWorkbook(org.id, moved.id));
  await db
    .update(brandTable)
    .set({ deletedAt: null })
    .where(eq(brandTable.id, brand.id));
  const invalid = await importWorkbook(org.id, user.id, brand.id, {
    ...single,
    data: "Title\tPlatform\tDate\nBad date\tinstagram\t2026-02-31",
  });
  assert(invalid.issues.some((i) => i.includes("valid YYYY")));
  await assert.rejects(
    applyWorkbook(org.id, user.id, invalid.id, invalid.document),
  );
  const xlsx = new ExcelJS.Workbook();
  const sheet = xlsx.addWorksheet("Plan");
  sheet.addRow(["Title", "Platform", "Caption", "Date"]);
  sheet.addRow([
    "Excel idea",
    "instagram",
    "Verbatim <b>text</b>",
    new Date("2026-11-05T00:00:00Z"),
  ]);
  let bytes = await xlsx.xlsx.writeBuffer();
  const parsed = await parseContentWorkbook({
    name: "Plan.xlsx",
    kind: "xlsx",
    data: Buffer.from(bytes).toString("base64"),
    sheet: "Plan",
  });
  assert.equal(parsed.document.rows[0]!.caption, "Verbatim <b>text</b>");
  assert.equal(parsed.document.rows[0]!.date, "2026-11-05");
  sheet.getCell("C2").value = { formula: "1+1", result: 2 };
  bytes = await xlsx.xlsx.writeBuffer();
  await assert.rejects(
    parseContentWorkbook({
      name: "Formula.xlsx",
      kind: "xlsx",
      data: Buffer.from(bytes).toString("base64"),
    }),
    /formula/,
  );
  const deleted = a.results[0]!.contentPostId!;
  await db
    .delete(platformPostTable)
    .where(eq(platformPostTable.contentPostId, deleted));
  await db
    .delete(contentPostTable)
    .where(
      and(
        eq(contentPostTable.id, deleted),
        eq(contentPostTable.brandId, brand.id),
      ),
    );
  const retried = await applyWorkbook(org.id, user.id, book.id, book.document);
  assert(retried.results.every((r) => r.contentPostId === null));
  console.log(
    JSON.stringify({
      captionFidelity: true,
      lww: true,
      staleReview: true,
      concurrentApply: true,
      retryPreservesEdits: true,
      ownership: true,
      slotProtection: true,
      slotIdentity: true,
      xlsx: true,
      formulaRefusal: true,
      deletionReceipt: true,
    }),
  );
} finally {
  await db
    .delete(contentWorkbookTable)
    .where(inArray(contentWorkbookTable.brandId, [brand.id, other.id]));
  await db
    .delete(platformPostTable)
    .where(inArray(platformPostTable.brandId, [brand.id, other.id]));
  await db
    .delete(contentPostTable)
    .where(inArray(contentPostTable.brandId, [brand.id, other.id]));
  await db
    .delete(initiativeTable)
    .where(inArray(initiativeTable.organizationId, [org.id, foreign.id]));
  await db
    .delete(seriesTable)
    .where(inArray(seriesTable.brandId, [brand.id, other.id]));
  await db
    .delete(brandTable)
    .where(inArray(brandTable.id, [brand.id, other.id]));
  await db
    .delete(organizationTable)
    .where(inArray(organizationTable.id, [org.id, foreign.id]));
}
