/** Operator-requested VRMA simplification; only runs on an explicitly selected preview database. */
import { db, withTransaction } from "@/server/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  platformPostTable,
  contentPostTable,
  amplificationTargetTable,
  amplifierTable,
} from "@/server/db/schema";
import {
  requestAmplification,
  saveAmplifier,
} from "@/server/ai/capabilities/amplification";
import { createId } from "@/server/db/utils";
const host = new URL(process.env.DATABASE_URL!).hostname;
if (
  !process.env.AMPLIFICATION_TEST_DATABASE_HOST ||
  host !== process.env.AMPLIFICATION_TEST_DATABASE_HOST
)
  throw new Error("Select the preview database explicitly");
const ids = [
  "post_hbAKS2x3AJzqfppW",
  "post_wm5GAWZ7sMjWsbpM",
  "post_cp3CtaVhQUM6fD7h",
];
const orgId = "org_4Kpk3KEBWbQcTEa6";
const member = await db.query.memberTable.findFirst({
  where: (m, { eq }) => eq(m.organizationId, orgId),
});
if (!member) throw new Error("Workspace not found");
const ctx = {
  orgId,
  userId: member.userId,
  surface: "test" as const,
  runId: createId("vrma"),
};
const contents = await db.query.contentPostTable.findMany({
  where: inArray(contentPostTable.id, ids),
  with: { brand: true },
});
if (
  contents.length !== 3 ||
  contents.some((c) => c.brand?.organizationId !== orgId)
)
  throw new Error("Unexpected content scope");
const rows = await db.query.platformPostTable.findMany({
  where: and(
    inArray(platformPostTable.contentPostId, ids),
    ne(platformPostTable.platform, "linkedin"),
  ),
});
if (
  rows.some(
    (p) =>
      p.status !== "draft" ||
      p.source !== "owned" ||
      p.externalId ||
      p.deliveryExternalId ||
      p.scheduledAt ||
      p.publishedAt,
  )
)
  throw new Error("Only unpublished, unscheduled drafts can be removed");
if (rows.length) {
  const targets = await db.query.amplificationTargetTable.findMany({
    where: inArray(
      amplificationTargetTable.platformPostId,
      rows.map((r) => r.id),
    ),
  });
  if (targets.length)
    throw new Error("A removed channel has amplification history");
  await Bun.write(
    "/tmp/vrma-preview-channel-backup.json",
    JSON.stringify({ contents, rows }, null, 2),
  );
  await withTransaction(async (tx) => {
    await tx.delete(platformPostTable).where(
      inArray(
        platformPostTable.id,
        rows.map((r) => r.id),
      ),
    );
    for (const c of contents)
      await tx
        .update(contentPostTable)
        .set({
          targetSpots: (c.targetSpots ?? []).filter(
            (s) => s.platform === "linkedin",
          ),
        })
        .where(eq(contentPostTable.id, c.id));
  });
}
const source = await db.query.platformPostTable.findFirst({
  where: and(
    eq(platformPostTable.contentPostId, ids[1]!),
    eq(platformPostTable.platform, "linkedin"),
  ),
});
const sahil = await db.query.amplifierTable.findFirst({
  where: and(
    eq(amplifierTable.name, "Sahil Mansuri"),
    eq(amplifierTable.organizationId, orgId),
  ),
});
if (!source || !sahil) throw new Error("Sahil or his source post is missing");
await requestAmplification.runValidated(
  {
    platformPostId: source.id,
    amplifierId: sahil.id,
    destinationPlatform: "linkedin",
    actionKind: "repost",
  },
  ctx,
);
await requestAmplification.runValidated(
  {
    platformPostId: source.id,
    amplifierId: sahil.id,
    destinationPlatform: "x",
    actionKind: "adaptation",
    note: "Adapt the invitation for Sahil’s own X account. Final copy pending.",
  },
  ctx,
);
const kyle = await db.query.amplifierTable.findFirst({
  where: and(
    eq(amplifierTable.name, "Kyle Tibbitts"),
    eq(amplifierTable.organizationId, orgId),
  ),
});
if (kyle)
  await saveAmplifier.runValidated(
    { id: kyle.id, handoffPreference: "slack" },
    ctx,
  );
console.log(
  `Preview updated: ${rows.length} extra channel drafts removed; Sahil’s two assignments planned. Nothing sent or published.`,
);
