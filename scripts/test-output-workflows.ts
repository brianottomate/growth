import { normalizeGrowthJson } from "@/server/ai/kernel/output";
/** Local workspace workflows on an isolated database, with fixture cleanup.
 * The policy guard refuses provider/model/background actions before execution. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { NATIVE_TOOLS, type OVERVIEW_TOOLS } from "@/server/ai/capabilities";
import { policyForGrowthTool } from "@/server/ai/kernel/policy";
import { growthAction, growthDomainTool } from "@/server/ai/kernel/tool";
import { buildGrowthToolRuntime } from "@/server/ai/kernel/runtime";
import { startAssistantRun } from "@/server/ai/kernel/journal";
import { db } from "@/server/db";
import {
  organizationTable,
  memberTable,
  userTable,
  personaTable,
  performanceIntakeTable,
  performanceCycleTable,
  assistantToolReceiptTable,
} from "@/server/db/schema";

assert(
  process.env.OUTPUT_QA_HOST &&
    new URL(process.env.DATABASE_URL!).hostname === process.env.OUTPUT_QA_HOST,
  "Set OUTPUT_QA_HOST to the isolated test branch hostname",
);
const suffix = crypto.randomUUID();
const orgId = `output_qa_org_${suffix}`,
  userId = `output_qa_user_${suffix}`;
const context = {
  orgId,
  userId,
  runId: `output_qa_run_${suffix}`,
  surface: "test" as const,
};
let checks = 0;
async function run(
  name: keyof typeof OVERVIEW_TOOLS,
  action: string,
  args: Record<string, unknown> = {},
) {
  const tool = NATIVE_TOOLS[`${name}__${action}`]!;
  const policy = policyForGrowthTool(name, { action });
  assert(
    ["local-read", "local-write"].includes(policy.consequence),
    `Refusing external work: ${name}.${action}`,
  );
  const input = tool.validationSchema.parse(args);
  const output = normalizeGrowthJson(await tool.run(input, context));
  const parsed = z
    .object({ ok: z.literal(true), data: z.unknown() })
    .parse(output);
  assert(
    tool.resultSchema.safeParse(output).success,
    `${name}.${action} failed its result contract`,
  );
  checks++;
  console.log(`PASS ${name}.${action}`);
  return parsed.data;
}
const row = (value: unknown) => z.record(z.string(), z.unknown()).parse(value);
const id = (value: unknown) => z.object({ id: z.string() }).parse(value).id;
try {
  await db.insert(userTable).values({ id: userId, name: "Output contract QA" });
  await db
    .insert(organizationTable)
    .values({ id: orgId, name: "Output contract QA" });
  await db.insert(memberTable).values({ userId, organizationId: orgId });
  const brand = row(
    await run("brandWrite", "create", { name: `Output QA ${suffix}` }),
  );
  const brandId = z.string().parse(brand.brandId),
    brandSlug = z.string().parse(brand.slug);
  const personaId = id(
    await run("personaWrite", "create", {
      brandId,
      name: "Family stays",
      geographies: ["California"],
    }),
  );
  await run("personaWrite", "update", {
    personaId,
    notes: "Updated fixture",
    demandGeography: {
      countries: ["US"],
      states: ["CA"],
      source: "QA",
    },
  });
  await run("personaRead", "list", { brandId });
  const productId = id(
    await run("productAtlasWrite", "create", {
      brandId,
      name: "QA product",
      slug: `qa-${suffix}`,
    }),
  );
  await run("productAtlasWrite", "update", {
    productId,
    description: "Updated fixture",
  });
  await run("productAtlasRead", "get", { productId });
  await run("productAtlasRead", "list");
  const storefrontId = id(
    await run("storefrontWrite", "create", {
      productId,
      surface: "chrome_web_store",
    }),
  );
  await run("storefrontWrite", "update", {
    storefrontId,
    staleNote: "QA draft updated",
    listingStatus: "draft",
  });
  await run("storefrontWrite", "markStale", {
    storefrontId,
    note: "QA follow-up",
  });
  await run("storefrontWrite", "assignManager", {
    storefrontId,
    managerUserId: userId,
  });
  await run("storefrontWrite", "confirmCurrent", {
    storefrontId,
    note: "QA verified",
  });
  await run("storefrontRead", "get", { storefrontId });
  await run("storefrontRead", "list", { productId });
  await run("storefrontRead", "listReferences", { storefrontId });
  const campaign = row(
    await run("adsWrite", "draftCampaign", {
      brandSlug,
      name: "Output QA campaign",
    }),
  );
  const campaignId = id(campaign.campaign);
  await run("adsWrite", "addAudience", {
    campaignId,
    name: "Family stays",
    personaId,
    countries: ["US"],
    ageMin: 25,
    ageMax: 65,
  });
  const { platformCampaignId } = z
    .object({ platformCampaignId: z.string() })
    .parse(
      await run("adsWrite", "planPlatform", {
        campaignId,
        platform: "google_ads",
      }),
    );
  const images = {
    landscape: "https://example.com/landscape.jpg",
    square: "https://example.com/square.jpg",
  };
  const platformDraft = await run("adsWrite", "setPlatformDraft", {
    platformCampaignId,
    budget: 50,
    budgetType: "daily",
    google: { campaignType: "display", images },
  });
  const cropsSchema = z.object({
    settings: z.object({
      google: z.object({
        images: z.object({ landscape: z.string(), square: z.string() }),
      }),
    }),
  });
  assert.deepEqual(
    cropsSchema.parse(platformDraft).settings.google.images,
    images,
  );
  // A later patch must preserve the previously reviewed crops.
  const patchedDraft = await run("adsWrite", "setPlatformDraft", {
    platformCampaignId,
    google: { businessName: "QA brand" },
  });
  assert.deepEqual(
    cropsSchema.parse(patchedDraft).settings.google.images,
    images,
  );
  await run("adsRead", "openCampaign", { campaignId });
  await run("adsRead", "listCampaigns", { brandId });
  const programId = id(
    row(
      await run("lifecycleWrite", "createProgram", {
        brandId,
        name: "QA welcome",
      }),
    ).program,
  );
  const stepId = id(
    row(
      await run("lifecycleWrite", "addStep", {
        programId,
        name: "Welcome email",
      }),
    ).step,
  );
  await run("lifecycleWrite", "updateStep", {
    stepId,
    changes: { subject: "QA subject", body: "QA body" },
  });
  await run("lifecycleWrite", "updateProgram", {
    programId,
    changes: { description: "QA journey" },
  });
  await run("lifecycleRead", "inspectProgram", { programId });
  await run("lifecycleRead", "overview", { brandId });
  await run("lifecycleRead", "findGaps", { brandId });
  await run("lifecycleRead", "searchCampaigns", { brandId });
  await run("lifecycleWrite", "archiveProgram", { programId });
  await run("lifecycleWrite", "restoreProgram", { programId });
  const accountId = id(
    row(
      await run("performanceWrite", "createAccount", {
        name: "QA client",
        brandId,
      }),
    ).account,
  );
  const cycleId = id(
    row(
      await run("performanceWrite", "openCycle", {
        accountId,
        period: "2026-09",
        mediaBudget: 1000,
      }),
    ).cycle,
  );
  await run("performanceWrite", "updateCycle", {
    cycleId,
    notes: "QA updated",
  });
  await run("performanceRead", "get", { accountId });
  await run("performanceRead", "list");
  const [intake] = await db
    .insert(performanceIntakeTable)
    .values({
      accountId,
      brandId,
      brandSlug,
      answers: { anythingElse: "Verified intake fixture" },
      mediaBudgetDollars: 1200,
    })
    .returning();
  assert(intake);
  const audit = row(
    await run("performanceWrite", "applyIntake", {
      intakeId: intake.id,
      mediaBudgetDollars: 1700,
    }),
  );
  const applied = z
    .array(
      z.object({
        targetType: z.string(),
        targetId: z.string(),
        field: z.string(),
        value: z.unknown(),
      }),
    )
    .parse(audit.applied);
  const budget = applied.find(
    (change) => change.targetType === "cycle" && change.field === "mediaBudget",
  );
  assert(budget);
  assert.equal(budget.value, 1700);
  const savedCycle = await db.query.performanceCycleTable.findFirst({
    where: eq(performanceCycleTable.id, budget.targetId),
  });
  assert.equal(savedCycle?.mediaBudget, budget.value);
  assert.equal(z.array(z.unknown()).parse(audit.evidence).length, 2);
  console.log("PASS intake evidence agrees with saved budget override");
  await run("personaWrite", "delete", { personaId });
  // A completed write is receipted and replayed without executing it twice.
  const receiptRunId = await startAssistantRun({
    organizationId: orgId,
    userId,
    surface: "test",
    model: "output-contract-qa",
    contextManifest: {
      surface: "test",
      characters: 0,
      cachedPrefixCharacters: 0,
      sections: [],
    },
  });
  let writes = 0;
  const createFixture = growthDomainTool({
    description: "QA receipt replay",
    actions: {
      create: growthAction({
        description: "Create fixture",
        inputSchema: z.object({}),
        outputSchema: z.object({ id: z.string() }),
        execute: async () => {
          writes++;
          const [created] = await db
            .insert(personaTable)
            .values({ brandId, name: "Receipt replay fixture" })
            .returning({ id: personaTable.id });
          return created!;
        },
      }),
    },
  });
  const runtime = buildGrowthToolRuntime({
    tools: { personaWrite: createFixture },
    identity: { orgId, userId },
    runId: receiptRunId,
    surface: "test",
  });
  const options = {
    toolCallId: "receipt-replay",
    messages: [],
    context: runtime.context,
  };
  const result = await runtime.tools.personaWrite.execute!(
    { action: "create" },
    options,
  );
  const replay = await runtime.tools.personaWrite.execute!(
    { action: "create" },
    options,
  );
  assert.deepEqual(replay, result);
  assert.equal(writes, 1);
  assert.equal(row(result).ok, true);
  assert.equal(typeof row(row(result).data).id, "string");
  const receipt = await db.query.assistantToolReceiptTable.findFirst({
    where: eq(assistantToolReceiptTable.runId, receiptRunId),
  });
  assert.equal(receipt?.status, "completed");
  assert.deepEqual(receipt?.output, result);
  checks++;
  console.log("PASS completed write and receipt replay");
  console.log(JSON.stringify({ workflowChecks: checks, providerCalls: 0 }));
} finally {
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, userId));
  console.log("QA fixtures removed");
}
