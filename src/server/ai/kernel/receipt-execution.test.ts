import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { executeReceipt, type ReceiptStore } from "./receipt-execution";
import { capabilityErrorSchema } from "./output";
import { policyForGrowthTool } from "./policy";
import type { GrowthExecutionContext } from "./tool";

const context: GrowthExecutionContext = {
  orgId: "org",
  userId: "user",
  runId: "run",
  surface: "test",
};
const resultSchema = z.object({
  ok: z.literal(true),
  action: z.literal("setAdCopy"),
  data: z.object({ id: z.string() }),
});
const success = { ok: true, action: "setAdCopy", data: { id: "ad" } } as const;

function fixture() {
  let stored: Awaited<ReturnType<ReceiptStore["read"]>>;
  let executions = 0;
  let access = true;
  let output: unknown = success;
  const receipts: ReceiptStore = {
    async claim({ name, value }) {
      if (stored) return undefined;
      stored = {
        toolName: name,
        input: value,
        output: null,
        status: "running",
      };
      return "receipt";
    },
    async read() {
      return stored;
    },
    async finish(_id, result) {
      if (!stored) throw new Error("No receipt");
      stored = { ...stored, ...result };
    },
  };
  const call = (
    value: unknown = { adId: "ad", headline: "New" },
    surface = context.surface,
  ) =>
    executeReceipt({
      name: "adsWrite__setAdCopy",
      value,
      toolCallId: "call",
      context: { ...context, surface },
      policy: policyForGrowthTool("adsWrite__setAdCopy"),
      resultSchema,
      receipts,
      assertAccess: async () => {
        if (!access)
          throw new Error(
            "The user no longer has access to this organization.",
          );
      },
      execute: async () => {
        executions++;
        return output;
      },
    });
  return {
    call,
    executions: () => executions,
    stored: () => stored,
    revoke: () => {
      access = false;
    },
    output: (value: unknown) => {
      output = value;
    },
    replaceReceipt: (receipt: NonNullable<typeof stored>) => {
      stored = receipt;
    },
  };
}

describe("receipt authorization and write replay", () => {
  test("a completed write replays once even when jsonb reorders input keys", async () => {
    const f = fixture();
    expect(await f.call()).toEqual(success);
    expect(await f.call({ headline: "New", adId: "ad" })).toEqual(success);
    expect(f.executions()).toBe(1);
  });
  test("revoked membership cannot read a previously completed result", async () => {
    const f = fixture();
    await f.call();
    f.revoke();
    expect(await f.call()).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(f.executions()).toBe(1);
    expect(f.stored()?.output).toEqual(success);
  });
  test("surface restrictions apply before replay", async () => {
    const f = fixture();
    await f.call();
    f.replaceReceipt({
      toolName: "adsWrite__setAdCopy",
      input: { adId: "ad", headline: "New" },
      output: success,
      status: "completed",
    });
    const result = await executeReceipt({
      name: "adsWrite__setAdCopy",
      value: { adId: "ad", headline: "New" },
      toolCallId: "call",
      context,
      policy: {
        ...policyForGrowthTool("adsWrite__setAdCopy"),
        surfaces: ["mcp"],
      },
      resultSchema,
      assertAccess: async () => undefined,
      execute: async () => {
        throw new Error("Must not execute");
      },
      receipts: {
        claim: async () => {
          throw new Error("Must not claim");
        },
        read: async () => {
          throw new Error("Must not read");
        },
        finish: async () => {
          throw new Error("Must not finish");
        },
      },
    });
    expect(capabilityErrorSchema.parse(result).error.message).toContain(
      "not available",
    );
  });
  test("a reused call ID cannot replay another payload or tool", async () => {
    const f = fixture();
    await f.call();
    expect(await f.call({ adId: "other", headline: "New" })).toMatchObject({
      ok: false,
    });
    f.replaceReceipt({ ...f.stored()!, toolName: "brandWrite__create" });
    expect(await f.call()).toMatchObject({ ok: false });
    expect(f.executions()).toBe(1);
  });
  test("a malformed fresh result is recorded as failed and never executes again", async () => {
    const f = fixture();
    f.output({ ...success, data: { id: 123 } });
    expect(await f.call()).toMatchObject({ ok: false });
    expect(f.stored()?.status).toBe("failed");
    expect(await f.call()).toMatchObject({ ok: false });
    expect(f.executions()).toBe(1);
  });
  test("a malformed old receipt is rejected without repeating the write", async () => {
    const f = fixture();
    f.replaceReceipt({
      toolName: "adsWrite__setAdCopy",
      input: { adId: "ad", headline: "New" },
      output: { ...success, data: { id: 123 } },
      status: "completed",
    });
    expect(await f.call()).toMatchObject({ ok: false });
    expect(f.executions()).toBe(0);
  });
  test("an interrupted claimed write stays uncertain and is not repeated", async () => {
    const f = fixture();
    f.replaceReceipt({
      toolName: "adsWrite__setAdCopy",
      input: { adId: "ad", headline: "New" },
      output: null,
      status: "running",
    });
    expect(capabilityErrorSchema.parse(await f.call()).error.message).toContain(
      "already running",
    );
    expect(f.executions()).toBe(0);
  });
});
