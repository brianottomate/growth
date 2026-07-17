import { and, desc, eq, isNull } from "drizzle-orm";
import type { Tool, ToolExecutionOptions } from "ai";
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
import type { GrowthExecutionContext } from "@/server/ai/kernel/tool";
import { db } from "@/server/db";
import {
  assistantToolReceiptTable,
  brandTable,
  memberTable,
} from "@/server/db/schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
    overviewNames.length === 21,
    `Expected 21 grouped tools, got ${overviewNames.length}`,
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
    Object.keys(MCP_TOOLS).length === 20,
    `Expected 20 MCP tools, got ${Object.keys(MCP_TOOLS).length}`,
  );

  for (const [name, definition] of Object.entries(OVERVIEW_TOOLS)) {
    assert("run" in definition, `${name} is not a native Growth tool`);
    const raw = definition.inputSchema as unknown;
    const serialized =
      raw && typeof raw === "object" && "jsonSchema" in raw
        ? (raw as { jsonSchema: Record<string, unknown> }).jsonSchema
        : z.toJSONSchema(raw as z.ZodType);
    // Anthropic rejects any tool whose input_schema lacks a root
    // type: "object" or uses anyOf/oneOf/allOf at the top level — a
    // bare-union root fails at request time, which contracts must catch
    // before a live call does.
    const root: Record<string, unknown> = serialized;
    assert(
      root.type === "object" &&
        !("anyOf" in root) &&
        !("oneOf" in root) &&
        !("allOf" in root),
      `${name} input schema must be a plain top-level object (no root union) for Anthropic`,
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
