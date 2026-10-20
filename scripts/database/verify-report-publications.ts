/** Run only on the named disposable branch. Exercises publication and ownership boundaries. */
import assert from "node:assert/strict";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceReportTable,
  performanceReportShareTable,
} from "@/server/db/schema";
import {
  getReportWorkspace,
  saveReportDraft,
  reviewReport,
  publishReport,
  revokeReportShare,
  loadPerformanceReportPage,
  upsertPerformanceReport,
} from "@/server/services/performance-report.service";
import {
  performanceReportSnapshot,
  type PerformanceReportContent,
} from "@/lib/performance-report";

assert.equal(
  process.env.DB_EXPERIMENT_BRANCH,
  "experiment/client-report-authoring",
);
assert.equal(
  new URL(process.env.DATABASE_URL!).hostname,
  process.env.REPORT_TEST_HOST,
);
assert(process.env.REPORT_TEST_HOST);
const legacy = await db
  .select({
    report: performanceReportTable,
    account: performanceAccountTable,
    share: performanceReportShareTable,
  })
  .from(performanceReportTable)
  .innerJoin(
    performanceAccountTable,
    eq(performanceAccountTable.id, performanceReportTable.accountId),
  )
  .innerJoin(
    performanceReportShareTable,
    eq(performanceReportShareTable.reportId, performanceReportTable.id),
  );
for (const { report, account, share } of legacy) {
  assert.equal(share.token, report.token);
  const snapshot = performanceReportSnapshot.parse(share.snapshot);
  assert.equal(snapshot.clientName, account.name);
  assert.equal(snapshot.status, report.status);
  assert.deepEqual(snapshot.metrics, report.metrics);
  assert.deepEqual(snapshot.highlights, report.highlights);
  assert.equal(snapshot.narrative, report.narrative);
}
const [owner] = await db
  .select({ orgId: brandTable.organizationId })
  .from(brandTable)
  .where(and(isNull(brandTable.deletedAt), eq(brandTable.isActive, true)))
  .limit(1);
assert(owner?.orgId);
const orgId = owner.orgId;
const nonce = crypto.randomUUID();
const [brand] = await db
  .insert(brandTable)
  .values({
    name: "Report publication verification",
    slug: `report-test-${nonce}`,
    organizationId: orgId,
  })
  .returning();
const [other] = await db
  .insert(brandTable)
  .values({
    name: "Other report verification",
    slug: `report-other-${nonce}`,
    organizationId: orgId,
  })
  .returning();
assert(brand && other);
const [account] = await db
  .insert(performanceAccountTable)
  .values({
    organizationId: orgId,
    brandId: brand.id,
    name: "Report verification",
  })
  .returning();
const [otherAccount] = await db
  .insert(performanceAccountTable)
  .values({
    organizationId: orgId,
    brandId: other.id,
    name: "Other report verification",
  })
  .returning();
assert(account && otherAccount);
const [cycle] = await db
  .insert(performanceCycleTable)
  .values({ accountId: otherAccount.id, period: "2026-10" })
  .returning();
assert(cycle);
const content: PerformanceReportContent = {
  periodLabel: "Verification",
  startDate: "2026-10-01",
  endDate: "2026-10-15",
  channels: [{ platform: "meta_ads", status: "live" }],
  metrics: { spend: 125, impressions: 1000 },
  otherBookings: [],
  highlights: [],
  deliverables: [],
  sources: [
    { label: "Fixture", via: "manual", fetchedAt: "2026-10-18T00:00:00Z" },
  ],
  narrative: "Reviewed original",
  recommendations: null,
  caseStudy: null,
};
try {
  await assert.rejects(() =>
    saveReportDraft("foreign-org", { brandId: brand.id, content }),
  );
  await assert.rejects(() =>
    saveReportDraft(orgId, { brandId: brand.id, cycleId: cycle.id, content }),
  );
  await assert.rejects(
    () =>
      saveReportDraft(orgId, {
        brandId: brand.id,
        content: {
          ...content,
          highlights: [
            {
              title: "Invalid",
              format: "image",
              spend: 0,
              impressions: 0,
              linkClicks: 0,
              imageUrl: "https://127.0.0.1/private.png",
            },
          ],
        },
      }),
    /stable Growth media URL/,
  );
  const saved = await saveReportDraft(orgId, { brandId: brand.id, content });
  const [raw] = await db
    .select()
    .from(performanceReportTable)
    .where(eq(performanceReportTable.id, saved.id));
  assert(raw);
  assert.equal(
    await loadPerformanceReportPage(raw.token),
    null,
    "Draft token must not expose content",
  );
  await assert.rejects(() => reviewReport(orgId, other.id, saved.id));
  await assert.rejects(() =>
    saveReportDraft(orgId, { brandId: other.id, id: saved.id, content }),
  );
  const first = await reviewReport(orgId, brand.id, saved.id);
  await saveReportDraft(orgId, {
    brandId: brand.id,
    id: saved.id,
    content: { ...content, narrative: "Changed before publish" },
  });
  await assert.rejects(
    () =>
      publishReport(orgId, {
        brandId: brand.id,
        reportId: saved.id,
        fingerprint: first.fingerprint,
        expiresInDays: 30,
      }),
    /changed since review/,
  );
  const reviewed = await reviewReport(orgId, brand.id, saved.id);
  await assert.rejects(() =>
    publishReport(orgId, {
      brandId: brand.id,
      reportId: saved.id,
      fingerprint: reviewed.fingerprint,
      expiresInDays: 91,
    }),
  );
  const shared = await publishReport(orgId, {
    brandId: brand.id,
    reportId: saved.id,
    fingerprint: reviewed.fingerprint,
    expiresInDays: 30,
  });
  const token = shared.path.split("/").at(-1)!;
  if (process.env.REPORT_HTTP_QA === "1") {
    const origin = "http://localhost:3109";
    const publicResponse = await fetch(`${origin}${shared.path}`);
    assert.equal(publicResponse.status, 200);
    assert((await publicResponse.text()).includes("Changed before publish"));
    const login = await fetch(`${origin}/api/dev/login?mode=token`);
    assert.equal(login.status, 200);
    const session = (await login.json()) as {
      cookieName: string;
      cookieValue: string;
    };
    const editor = await fetch(
      `${origin}/app/performance/clients/${brand.slug}/reports`,
      {
        headers: { Cookie: `${session.cookieName}=${session.cookieValue}` },
      },
    );
    assert.equal(editor.status, 200);
    const html = await editor.text();
    assert(html.includes("Client reports"));
    assert(html.includes("Review saved report"));
    assert(html.includes("Published links"));
    console.log(
      "Authenticated report editor and public snapshot rendered successfully",
    );
  }

  assert.equal(
    (await loadPerformanceReportPage(token))?.narrative,
    "Changed before publish",
  );
  // Repeated ordinary edits are allowed; public content is immutable.
  await saveReportDraft(orgId, {
    brandId: brand.id,
    id: saved.id,
    content: { ...content, narrative: "Later draft" },
  });
  await saveReportDraft(orgId, {
    brandId: brand.id,
    id: saved.id,
    content: { ...content, narrative: "Last write wins" },
  });
  assert.equal(
    (await getReportWorkspace(orgId, brand.id)).reports[0]?.content.narrative,
    "Last write wins",
  );
  assert.equal(
    (await loadPerformanceReportPage(token))?.narrative,
    "Changed before publish",
  );
  await assert.rejects(() =>
    revokeReportShare(orgId, { brandId: other.id, shareId: shared.id }),
  );
  await db
    .update(brandTable)
    .set({ deletedAt: new Date() })
    .where(eq(brandTable.id, brand.id));
  assert.equal(await loadPerformanceReportPage(token), null);
  await db
    .update(brandTable)
    .set({ deletedAt: null })
    .where(eq(brandTable.id, brand.id));
  await db
    .update(performanceAccountTable)
    .set({ deletedAt: new Date() })
    .where(eq(performanceAccountTable.id, account.id));
  assert.equal(await loadPerformanceReportPage(token), null);
  await db
    .update(performanceAccountTable)
    .set({ deletedAt: null })
    .where(eq(performanceAccountTable.id, account.id));
  await db
    .update(brandTable)
    .set({ organizationId: null })
    .where(eq(brandTable.id, brand.id));
  assert.equal(await loadPerformanceReportPage(token), null);
  await db
    .update(brandTable)
    .set({ organizationId: orgId })
    .where(eq(brandTable.id, brand.id));
  await db
    .update(performanceReportShareTable)
    .set({ expiresAt: new Date(0) })
    .where(eq(performanceReportShareTable.id, shared.id));
  assert.equal(await loadPerformanceReportPage(token), null);
  await db
    .update(performanceReportShareTable)
    .set({ expiresAt: new Date(Date.now() + 86400000) })
    .where(eq(performanceReportShareTable.id, shared.id));
  await revokeReportShare(orgId, { brandId: brand.id, shareId: shared.id });
  assert.equal(await loadPerformanceReportPage(token), null);

  if (process.env.REPORT_HTTP_QA === "1") {
    const revoked = await fetch(`http://localhost:3109${shared.path}`);
    assert((await revoked.text()).includes("This link is no longer active"));
  }
  const cliDraft = await upsertPerformanceReport({
    ...content,
    organizationId: orgId,
    brandSlug: brand.slug!,
    status: "draft",
  });
  assert.equal(cliDraft.path, null);
  const cliPublish = await upsertPerformanceReport({
    ...content,
    id: cliDraft.id,
    organizationId: orgId,
    brandSlug: brand.slug!,
    status: "published",
  });
  assert(cliPublish.path);
  assert.equal(
    (await loadPerformanceReportPage(cliPublish.path.split("/").at(-1)!))
      ?.narrative,
    content.narrative,
  );
  console.log(
    JSON.stringify({
      ok: true,
      preservedExistingLinks: legacy.length,
      checks:
        "ownership, cycle scope, draft privacy, reviewed publish, immutable shares, last-write-wins, archive, organization move, expiry, revoke, CLI",
    }),
  );
} finally {
  await db
    .delete(performanceAccountTable)
    .where(eq(performanceAccountTable.id, account.id));
  await db
    .delete(performanceAccountTable)
    .where(eq(performanceAccountTable.id, otherAccount.id));
  await db.delete(brandTable).where(eq(brandTable.id, brand.id));
  await db.delete(brandTable).where(eq(brandTable.id, other.id));
}
