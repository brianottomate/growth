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
  growthActionPolicies,
  policyForGrowthTool,
} from "@/server/ai/kernel/policy";
import { GROWTH_CAPABILITY_ACTIONS } from "@/lib/growth-capabilities";
import { buildGrowthToolRuntime } from "@/server/ai/kernel/runtime";
import {
  type GrowthExecutionContext,
  type GrowthTool,
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

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
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
  // Two shapes reach here: the validation union, whose variants are objects
  // carrying an `action` property, and the flattened model schema, whose
  // `action` is itself a union of described string consts.
  return variants.flatMap((variant) =>
    actionValuesFromSchema(variant.properties?.action ?? variant),
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
  const policyNames = Object.keys(growthActionPolicies).sort();
  assert(
    JSON.stringify(overviewNames) === JSON.stringify(policyNames),
    "Every tool must have exactly one policy entry",
  );
  assert(
    !("researchRead" in MCP_TOOLS),
    "MCP must omit open-world research tools",
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
      const catalogActions =
        GROWTH_CAPABILITY_ACTIONS[
          name as keyof typeof GROWTH_CAPABILITY_ACTIONS
        ];
      assert(catalogActions, `${name} is missing from the client-safe catalog`);
      assert(
        JSON.stringify([...catalogActions].sort()) ===
          JSON.stringify(expectedActions),
        `${name} catalog and runtime actions diverged`,
      );
      for (const action of expectedActions) {
        assert(
          policyForGrowthTool(name, { action }).surfaces.length > 0,
          `${name}.${action} has no allowed surface`,
        );
      }

      // The definitions behind the flattened schema. A description is what the
      // model chooses on, and an example is the promise that the description
      // still describes a call this action would accept.
      for (const [action, spec] of Object.entries(
        nativeDefinition.actions ?? {},
      )) {
        assert(
          spec.description.trim().length > 0,
          `${name}.${action} has no description`,
        );
        for (const [index, example] of (spec.examples ?? []).entries()) {
          const candidate = { ...(example as object), action };
          const strict = nativeDefinition.validationSchema.safeParse(candidate);
          assert(
            strict.success,
            `${name}.${action} example ${index} does not validate: ${strict.success ? "" : strict.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
          );
          assert(
            nativeDefinition.transportInputSchema.safeParse(candidate).success,
            `${name}.${action} example ${index} does not validate against the transport schema`,
          );
        }
      }
    }
  }

  const lifecycleWriteDefinition = OVERVIEW_TOOLS.lifecycleWrite as GrowthTool<
    unknown,
    unknown
  >;
  const lifecycleTransport = lifecycleWriteDefinition.transportInputSchema;
  for (const input of [
    {
      action: "linkCampaign",
      campaignId: "campaign_contract",
      programId: null,
    },
    {
      action: "updateProgram",
      programId: "program_contract",
      changes: { priority: "must_have" },
    },
    {
      action: "updateStep",
      stepId: "step_contract",
      changes: { channel: "email" },
    },
    {
      action: "createProgram",
      brandId: "brand_contract",
      name: "Program contract",
      status: "planned",
    },
    {
      action: "addStep",
      programId: "program_contract",
      name: "Step contract",
      status: "missing",
    },
    { action: "restoreProgram", programId: "program_contract" },
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
    policyForGrowthTool("contentMediaWrite", {
      action: "recoverArchiveMedia",
    }).consequence === "provider-write",
    "Content media policy lost its provider-write consequence",
  );
  assert(
    policyForGrowthTool("lifecycleWrite", { action: "linkCampaign" })
      .idempotent,
    "Grouped lifecycle policy lost action-level idempotency",
  );
  assert(
    policyForGrowthTool("sourceSyncWrite", {
      action: "syncWebsite",
    }).consequence === "background-run",
    "Source sync policy lost its background-run consequence",
  );
  assert(
    policyForGrowthTool("mediaAnalysisWrite", {
      action: "analyzeImage",
    }).consequence === "model-write",
    "Media analysis lost its model-write consequence",
  );
  assert(
    policyForGrowthTool("strategyWrite", {
      action: "updateCadence",
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
        actionPolicy: "valid",
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
    tools: { brandRead: OVERVIEW_TOOLS.brandRead },
    identity,
    runId,
    surface: "test",
  });
  const toolCallId = `gauntlet-brands-read-${runId}`;
  const first = await executeTool(
    runtime.tools.brandRead,
    { action: "list" },
    runtime.context,
    toolCallId,
  );
  assert(
    typeof first === "object" &&
      first !== null &&
      "ok" in first &&
      first.ok === true &&
      "data" in first &&
      typeof first.data === "object" &&
      first.data !== null &&
      "brands" in first.data &&
      Array.isArray(first.data.brands) &&
      first.data.brands.length > 0,
    "Real-data read did not return brands",
  );
  const replay = await executeTool(
    runtime.tools.brandRead,
    { action: "list" },
    runtime.context,
    toolCallId,
  );
  assert(
    JSON.stringify(canonicalJson(first)) ===
      JSON.stringify(canonicalJson(replay)),
    "A repeated toolCallId did not replay its receipt",
  );
  await completeAssistantRun(runId, {
    check: "real-data-read-and-idempotent-replay",
    brandCount: first.data.brands.length,
  });

  const deniedRunId = await startAssistantRun({
    organizationId: identity.orgId,
    userId: identity.userId,
    surface: "test",
    model: "gauntlet",
    contextManifest: composed.manifest,
  });
  const denied = buildGrowthToolRuntime({
    tools: { brandRead: OVERVIEW_TOOLS.brandRead },
    identity: { orgId: identity.orgId, userId: "missing-user" },
    runId: deniedRunId,
    surface: "test",
  });
  const deniedOutput = await executeTool(
    denied.tools.brandRead,
    { action: "list" },
    denied.context,
    `gauntlet-denied-${deniedRunId}`,
  );
  assert(
    typeof deniedOutput === "object" &&
      deniedOutput !== null &&
      "ok" in deniedOutput &&
      deniedOutput.ok === false &&
      "error" in deniedOutput &&
      typeof deniedOutput.error === "object" &&
      deniedOutput.error !== null &&
      "code" in deniedOutput.error &&
      deniedOutput.error.code === "forbidden",
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
      realBrands: first.data.brands.length,
      receiptReplay: true,
      permissionDenial: true,
      contextCharacters: composed.manifest.characters,
    }),
  );
}

await main();
