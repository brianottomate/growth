/** Read real records on an explicitly selected isolated QA branch.
 * No model/provider calls or workspace writes. Prints contract paths, never record payloads. */
import assert from "node:assert/strict";
import { and, eq, isNull } from "drizzle-orm";
import { OVERVIEW_TOOLS } from "@/server/ai/capabilities";
import { normalizeGrowthJson } from "@/server/ai/kernel/output";
import { policyForGrowthTool } from "@/server/ai/kernel/policy";
import type { GrowthTool } from "@/server/ai/kernel/tool";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";

assert(
  process.env.OUTPUT_QA_HOST &&
    new URL(process.env.DATABASE_URL!).hostname === process.env.OUTPUT_QA_HOST,
  "Set OUTPUT_QA_HOST to the isolated test branch hostname",
);
const [identity] = await db
  .select({ orgId: memberTable.organizationId, userId: memberTable.userId })
  .from(memberTable)
  .innerJoin(
    brandTable,
    and(
      eq(brandTable.organizationId, memberTable.organizationId),
      isNull(brandTable.deletedAt),
    ),
  )
  .limit(1);
assert(identity, "QA branch needs workspace records");
const brands = await db.query.brandTable.findMany({
  where: and(
    eq(brandTable.organizationId, identity.orgId),
    isNull(brandTable.deletedAt),
  ),
  limit: 3,
});
const context = {
  ...identity,
  runId: "output-contract-audit",
  surface: "test" as const,
};
const allowed = new Set([
  "brandRead",
  "adsRead",
  "productAtlasRead",
  "storefrontRead",
  "personaRead",
  "contentRead",
  "contentStrategyRead",
  "performanceRead",
  "launchRead",
  "strategyRead",
  "mediaLibraryRead",
  "mediaAnalysisRead",
  "playbookRead",
  "amplificationRead",
  "listeningRead",
]);
const skipped = new Set<string>();
let passed = 0;
const failures: { name: string; issues: unknown }[] = [];
for (const brand of brands) {
  const content = await db.query.contentPostTable.findFirst({
    where: (t, { eq }) => eq(t.brandId, brand.id),
  });
  const campaign = await db.query.campaignTable.findFirst({
    where: (t, { eq }) => eq(t.brandId, brand.id),
  });
  const product = await db.query.productTable.findFirst({
    where: (t, { eq }) => eq(t.brandId, brand.id),
  });
  const storefront = product
    ? await db.query.storefrontTable.findFirst({
        where: (t, { eq }) => eq(t.productId, product.id),
      })
    : undefined;
  const candidates = {
    brandId: brand.id,
    brandSlug: brand.slug,
    contentPostId: content?.id,
    campaignId: campaign?.id,
    productId: product?.id,
    storefrontId: storefront?.id,
    limit: 5,
    days: 14,
    query: "",
    onlyEngageWorthy: false,
  };
  for (const [name, definition] of Object.entries(OVERVIEW_TOOLS)) {
    if (!allowed.has(name)) continue;
    const tool = definition as GrowthTool;
    for (const [action, spec] of Object.entries(tool.actions ?? {})) {
      const key = `${name}.${action}`;
      if (
        policyForGrowthTool(name, { action }).consequence !== "local-read" ||
        key === "mediaLibraryRead.listingPhotos"
      )
        continue;
      const parsed = spec.inputSchema.safeParse({
        ...candidates,
        id:
          name === "productAtlasRead"
            ? product?.id
            : name === "storefrontRead"
              ? storefront?.id
              : name === "contentRead"
                ? content?.id
                : undefined,
      });
      if (!parsed.success) {
        skipped.add(key);
        continue;
      }
      try {
        const raw = normalizeGrowthJson(
          await spec.runValidated(parsed.data, context),
        );
        if (
          raw &&
          typeof raw === "object" &&
          !Array.isArray(raw) &&
          typeof raw.error === "string"
        ) {
          skipped.add(`${key} (service refusal)`);
          continue;
        }
        const checked = spec.outputSchema.safeParse(raw);
        if (!checked.success) {
          failures.push({
            name: key,
            issues: checked.error.issues.map((i) => ({
              path: i.path.join("."),
              code: i.code,
            })),
          });
          continue;
        }
        // Parsing must retain the full response, including optional union fields.
        assert.deepEqual(
          checked.data,
          raw,
          `${key} output schema stripped data`,
        );
        passed++;
        console.log(`PASS ${key}`);
      } catch (error) {
        failures.push({
          name: key,
          issues:
            error instanceof Error
              ? error.message.slice(0, 180)
              : "execution failed",
        });
      }
    }
  }
}
console.log(
  JSON.stringify({ passed, skipped: [...skipped], failures }, null, 2),
);
assert.equal(failures.length, 0, "Live output contracts failed");
assert(passed >= 20, "Insufficient live result coverage");
