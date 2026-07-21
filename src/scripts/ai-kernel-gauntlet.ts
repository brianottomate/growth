import { and, desc, eq, isNull } from "drizzle-orm";
import {
  asSchema,
  type FlexibleSchema,
  type Tool,
  type ToolExecutionOptions,
} from "ai";
import { z } from "zod";

import { MCP_TOOLS, OVERVIEW_TOOLS } from "@/server/ai/capabilities";
import { composeGrowthContext } from "@/server/ai/kernel/context";
import {
  completeAssistantRun,
  startAssistantRun,
} from "@/server/ai/kernel/journal";
import {
  growthToolPolicies,
  policyForGrowthTool,
} from "@/server/ai/kernel/policy";
import { buildGrowthToolRuntime } from "@/server/ai/kernel/runtime";
import type {
  GrowthExecutionContext,
  GrowthTool,
} from "@/server/ai/kernel/tool";
import { db } from "@/server/db";
import {
  assistantToolReceiptTable,
  brandTable,
  memberTable,
} from "@/server/db/schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type JsonSchemaObject = {
  type?: unknown;
  anyOf?: unknown;
  oneOf?: unknown;
  allOf?: unknown;
  properties?: Record<string, JsonSchemaObject>;
  const?: unknown;
  enum?: unknown[];
};

function assertProviderObjectSchema(name: string, schema: JsonSchemaObject) {
  assert(schema.type === "object", `${name} must serialize as an object`);
  assert(
    schema.anyOf === undefined &&
      schema.oneOf === undefined &&
      schema.allOf === undefined,
    `${name} cannot use a top-level anyOf/oneOf/allOf`,
  );
}

function actionValuesFromSchema(schema: JsonSchemaObject): string[] {
  const direct =
    typeof schema.const === "string"
      ? [schema.const]
      : (schema.enum ?? []).filter(
          (value): value is string => typeof value === "string",
        );
  if (direct.length) return direct;
  const variants: JsonSchemaObject[] = [];
  for (const value of [schema.oneOf, schema.anyOf]) {
    if (!Array.isArray(value)) continue;
    for (const candidate of value) {
      if (typeof candidate === "object" && candidate !== null) {
        variants.push(candidate as JsonSchemaObject);
      }
    }
  }
  return variants.flatMap((variant) =>
    actionValuesFromSchema(variant.properties?.action ?? {}),
  );
}

async function executeTool<I, O>(
  tool: Tool<I, O, GrowthExecutionContext>,
  input: I,
  context: GrowthExecutionContext,
  toolCallId: string,
) {
  assert(tool.execute, "Expected an executable tool");
  const options: ToolExecutionOptions<GrowthExecutionContext> = {
    toolCallId,
    messages: [],
    context,
  };
  const output = await tool.execute(input, options);
  assert(
    !(typeof output === "object" && output && Symbol.asyncIterator in output),
    "Streaming tool outputs are outside the Growth kernel contract",
  );
  return output as O;
}

async function main() {
  const contractsOnly = process.argv.includes("--contracts-only");
  const overviewNames = Object.keys(OVERVIEW_TOOLS).sort();
  const policyNames = Object.keys(growthToolPolicies).sort();
  assert(
    overviewNames.length === 23,
    `Expected 23 grouped tools, got ${overviewNames.length}`,
  );
  assert(
    JSON.stringify(overviewNames) === JSON.stringify(policyNames),
    "Every tool must have exactly one policy entry",
  );
  assert(
    !("researchRead" in MCP_TOOLS),
    "MCP must omit open-world research tools",
  );
  assert(
    Object.keys(MCP_TOOLS).length === 22,
    `Expected 22 MCP tools, got ${Object.keys(MCP_TOOLS).length}`,
  );

  for (const [name, definition] of Object.entries(OVERVIEW_TOOLS)) {
    assert("run" in definition, `${name} is not a native Growth tool`);
    const nativeDefinition = definition as GrowthTool<unknown, unknown>;
    const modelSchema = (await asSchema(
      definition.inputSchema as FlexibleSchema<unknown>,
    ).jsonSchema) as JsonSchemaObject | undefined;
    assert(modelSchema, `${name} has no model input schema`);
    assertProviderObjectSchema(`${name} model schema`, modelSchema);

    const transportSchema = z.toJSONSchema(
      nativeDefinition.transportInputSchema,
    ) as JsonSchemaObject;
    assertProviderObjectSchema(`${name} transport schema`, transportSchema);

    const validationSchema = z.toJSONSchema(
      nativeDefinition.validationSchema,
    ) as JsonSchemaObject;
    const expectedActions = [
      ...new Set(actionValuesFromSchema(validationSchema)),
    ].sort();
    if (expectedActions.length) {
      const advertisedActions = [
        ...new Set(
          actionValuesFromSchema(modelSchema.properties?.action ?? {}),
        ),
      ].sort();
      assert(
        JSON.stringify(advertisedActions) === JSON.stringify(expectedActions),
        `${name} model schema lost actions: expected ${expectedActions.join(", ")}, got ${advertisedActions.join(", ")}`,
      );
    }
  }

  const lifecycleWriteDefinition = OVERVIEW_TOOLS.lifecycleWrite as GrowthTool<
    unknown,
    unknown
  >;
  const lifecycleTransport = lifecycleWriteDefinition.transportInputSchema;
  for (const input of [
    {
      action: "link_campaign",
      campaignId: "campaign_contract",
      programId: null,
    },
    {
      action: "update_program",
      programId: "program_contract",
      changes: { priority: "must_have" },
    },
    {
      action: "update_step",
      stepId: "step_contract",
      changes: { channel: "email" },
    },
    {
      action: "create_program",
      brandId: "brand_contract",
      name: "Program contract",
      status: "planned",
    },
    {
      action: "add_step",
      programId: "program_contract",
      name: "Step contract",
      status: "missing",
    },
    { action: "restore_program", programId: "program_contract" },
  ]) {
    assert(
      lifecycleTransport.safeParse(input).success,
      `Lifecycle transport schema rejected ${input.action}`,
    );
    assert(
      lifecycleWriteDefinition.validationSchema.safeParse(input).success,
      `Lifecycle runtime schema rejected ${input.action}`,
    );
  }
  assert(
    policyForGrowthTool("contentWrite", {
      action: "recoverArchiveMediaToContent",
    }).consequence === "provider-write",
    "Grouped content policy lost its provider-write consequence",
  );
  assert(
    policyForGrowthTool("lifecycleWrite", { action: "link_campaign" })
      .idempotent,
    "Grouped lifecycle policy lost action-level idempotency",
  );
  assert(
    policyForGrowthTool("sourceSyncWrite", {
      action: "syncBrandWebsite",
    }).consequence === "background-run",
    "Source sync policy lost its background-run consequence",
  );
  assert(
    policyForGrowthTool("contentAnalysisWrite", {
      action: "proposeContentGroupings",
    }).consequence === "model-read",
    "Grouping proposals must remain review-only model reads",
  );
  assert(
    policyForGrowthTool("strategyWrite", {
      action: "updateChannelCadence",
    }).idempotent,
    "Strategy updates lost action-level idempotency",
  );

  const composed = composeGrowthContext({
    surface: "test",
    maximumCharacters: 100,
    sections: [
      { id: "stable", content: "stable product instruction", cache: "session" },
      { id: "request", content: "real-data gauntlet" },
    ],
  });
  assert(composed.messages.length === 2, "Named context sections were lost");

  if (contractsOnly) {
    console.log(
      JSON.stringify({
        tools: overviewNames.length,
        mcpTools: Object.keys(MCP_TOOLS).length,
        schemas: "valid",
        groupedPolicy: "valid",
        contextCharacters: composed.manifest.characters,
      }),
    );
    return;
  }

  const identityRow = await db
    .select({
      userId: memberTable.userId,
      orgId: memberTable.organizationId,
    })
    .from(memberTable)
    .innerJoin(
      brandTable,
      and(
        eq(brandTable.organizationId, memberTable.organizationId),
        isNull(brandTable.deletedAt),
      ),
    )
    .orderBy(desc(brandTable.createdAt))
    .limit(1);
  const identity = identityRow[0];
  assert(
    identity?.userId && identity.orgId,
    "No real member with brand data found",
  );

  const runId = await startAssistantRun({
    organizationId: identity.orgId,
    userId: identity.userId,
    surface: "test",
    model: "gauntlet",
    contextManifest: composed.manifest,
  });
  const runtime = buildGrowthToolRuntime({
    tools: { brandsRead: OVERVIEW_TOOLS.brandsRead },
    identity,
    runId,
    surface: "test",
  });
  const toolCallId = `gauntlet-brands-read-${runId}`;
  const first = await executeTool(
    runtime.tools.brandsRead,
    { action: "listBrands" },
    runtime.context,
    toolCallId,
  );
  assert(
    typeof first === "object" &&
      first !== null &&
      "brands" in first &&
      Array.isArray(first.brands) &&
      first.brands.length > 0,
    "Real-data read did not return brands",
  );
  const replay = await executeTool(
    runtime.tools.brandsRead,
    { action: "listBrands" },
    runtime.context,
    toolCallId,
  );
  assert(
    JSON.stringify(first) === JSON.stringify(replay),
    "A repeated toolCallId did not replay its receipt",
  );
  await completeAssistantRun(runId, {
    check: "real-data-read-and-idempotent-replay",
    brandCount: first.brands.length,
  });

  const deniedRunId = await startAssistantRun({
    organizationId: identity.orgId,
    userId: identity.userId,
    surface: "test",
    model: "gauntlet",
    contextManifest: composed.manifest,
  });
  const denied = buildGrowthToolRuntime({
    tools: { brandsRead: OVERVIEW_TOOLS.brandsRead },
    identity: { orgId: identity.orgId, userId: "missing-user" },
    runId: deniedRunId,
    surface: "test",
  });
  const deniedOutput = await executeTool(
    denied.tools.brandsRead,
    { action: "listBrands" },
    denied.context,
    `gauntlet-denied-${deniedRunId}`,
  );
  assert(
    typeof deniedOutput === "object" &&
      deniedOutput !== null &&
      "code" in deniedOutput &&
      deniedOutput.code === "forbidden",
    "Execute-time membership revocation was not enforced",
  );
  await completeAssistantRun(deniedRunId, { check: "permission-denied" });

  const receipts = await db.query.assistantToolReceiptTable.findMany({
    where: eq(assistantToolReceiptTable.runId, runId),
  });
  assert(receipts.length === 1, "Expected one deduplicated tool receipt");
  assert(receipts[0]?.status === "completed", "Tool receipt did not complete");
  const deniedReceipts = await db.query.assistantToolReceiptTable.findMany({
    where: eq(assistantToolReceiptTable.runId, deniedRunId),
  });
  assert(
    deniedReceipts.length === 1 && deniedReceipts[0]?.status === "failed",
    "Permission denial did not leave a failed receipt",
  );

  console.log(
    JSON.stringify({
      tools: overviewNames.length,
      mcpTools: Object.keys(MCP_TOOLS).length,
      realBrands: first.brands.length,
      receiptReplay: true,
      permissionDenial: true,
      contextCharacters: composed.manifest.characters,
    }),
  );
}

await main();
