import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { tool, type UIMessage } from "ai";
import { operationTools, legacyApprovalTools } from "./operations";
import { growthAction, growthDomainTool } from "./tool";
import { anthropicTools } from "./anthropic-tools";
import { policyForGrowthTool } from "./policy";
import { withGrowthExecution } from "./runtime";
import { startOperationJob } from "./operation-jobs";
const context = {
  orgId: "org",
  userId: "user",
  runId: "run",
  surface: "test" as const,
};

const catalog = {
  adsWrite: growthDomainTool({
    description: "Ads",
    actions: {
      setAdCopy: growthAction({
        description: "Edit copy",
        inputSchema: z.object({ adId: z.string(), headline: z.string() }),
        outputSchema: z.object({ id: z.string() }),
        execute: async ({ adId }) => ({ id: adId }),
      }),
      push: growthAction({
        description: "Push",
        inputSchema: z.object({ campaignId: z.string() }),
        outputSchema: z.object({ id: z.string() }),
        execute: async ({ campaignId }) => ({ id: campaignId }),
      }),
    },
  }),
};
describe("operation discovery", () => {
  test("advertises operation-specific required fields and returns the domain result", async () => {
    const tools = operationTools(catalog, "test");
    const edit = tools.adsWrite__setAdCopy!;
    expect(tools).not.toHaveProperty("adsWrite");
    const schema = z.toJSONSchema(edit.transportInputSchema);
    expect(schema.required).toEqual(["adId", "headline"]);
    expect(schema.properties).not.toHaveProperty("campaignId");
    expect(schema.properties).not.toHaveProperty("action");
    expect(edit.validationSchema.safeParse({ adId: "ad" }).success).toBe(false);
    const result = await edit.run(
      { adId: "ad", headline: "New copy" },
      context,
    );
    result satisfies { ok: true; action: "setAdCopy"; data: { id: string } };
    expect(result).toEqual({
      ok: true,
      action: "setAdCopy",
      data: { id: "ad" },
    });
  });
  test("the receipt adapter retains each operation's input and output contract", () => {
    const runtime = withGrowthExecution(operationTools(catalog, "test"));
    const edit = runtime.adsWrite__setAdCopy!;
    type Input = z.infer<typeof edit.validationSchema>;
    const valid: Input = { adId: "ad", headline: "Copy" };
    // @ts-expect-error A registry or wrapper that erases input types breaks this check.
    const invalid: Input = { adId: "ad", headline: 123 };
    expect(edit.validationSchema.safeParse(valid).success).toBe(true);
    expect(edit.validationSchema.safeParse(invalid).success).toBe(false);
    type Output = Awaited<ReturnType<typeof edit.execute>>;
    const assertResult = (output: Output) => {
      if (output.ok) {
        output.action satisfies "setAdCopy";
        output.data.id satisfies string;
        // @ts-expect-error A result ID is a string, not an erased or numeric value.
        output.data.id satisfies number;
      } else {
        output.error.message satisfies string;
      }
    };
    assertResult({ ok: true, action: "setAdCopy", data: { id: "ad" } });
    expect(edit.outputSchema).toBe(edit.resultSchema);
  });
  test("MCP excludes provider-spend operations individually", () => {
    const tools = operationTools(catalog, "mcp");
    expect(tools).toHaveProperty("adsWrite__setAdCopy");
    expect(tools).not.toHaveProperty("adsWrite__push");
    expect(
      policyForGrowthTool("adsWrite__push", { action: "setAdCopy" }).approval,
    ).toBe("user");
  });
  test("provider search preserves wrapped execution hooks", () => {
    const tools = operationTools(catalog, "test");
    const wrapped = anthropicTools(tools);
    expect(wrapped.adsWrite__setAdCopy?.execute).toBe(
      tools.adsWrite__setAdCopy?.execute,
    );
    expect(
      wrapped.adsWrite__setAdCopy?.providerOptions?.anthropic?.deferLoading,
    ).toBe(true);
    expect(wrapped.toolSearch.type).toBe("provider");
  });
  test("approval-required work cannot bypass approval through job scheduling", async () => {
    let scheduled = false;
    expect(
      startOperationJob(
        "adsWrite__push",
        operationTools(catalog, "test").adsWrite__push!,
        { campaignId: "campaign" },
        context,
        () => {
          scheduled = true;
        },
      ),
    ).rejects.toThrow("cannot execute");
    expect(scheduled).toBe(false);
  });
});

test("saved grouped approvals retain only their pending action", () => {
  const message = {
    id: "saved",
    role: "assistant",
    parts: [
      {
        type: "tool-adsWrite",
        state: "approval-responded",
        toolCallId: "old",
        input: { action: "push", campaignId: "campaign" },
        approval: { id: "approval", approved: false },
      },
    ],
  } as UIMessage;
  const legacy = legacyApprovalTools(catalog, message);
  const tool = legacy.adsWrite as typeof catalog.adsWrite;
  expect(
    tool.validationSchema.safeParse({ action: "push", campaignId: "campaign" })
      .success,
  ).toBe(true);
  expect(
    tool.validationSchema.safeParse({
      action: "setAdCopy",
      adId: "ad",
      headline: "new",
    }).success,
  ).toBe(false);
  expect(
    legacyApprovalTools(catalog, {
      id: "user",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    }),
  ).toEqual({});
});

test("pitch edits advertise their read and save schemas directly to the assistant", () => {
  const definition = tool({ inputSchema: z.object({}) });
  const wrapped = anthropicTools(
    {
      performanceRead__pitch: definition,
      performanceWrite__savePitch: definition,
    },
    ["performanceRead__pitch", "performanceWrite__savePitch"],
  );
  expect(
    wrapped.performanceRead__pitch.providerOptions?.anthropic?.deferLoading,
  ).toBe(false);
  expect(
    wrapped.performanceWrite__savePitch.providerOptions?.anthropic
      ?.deferLoading,
  ).toBe(false);
});
