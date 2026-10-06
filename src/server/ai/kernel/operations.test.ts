import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { operationTools } from "./operations";
import { growthAction, growthDomainTool } from "./tool";
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
        inputSchema: z.object({
          adId: z.string(),
          headline: z.string(),
        }),
        outputSchema: z.object({
          id: z.string(),
        }),
        execute: async ({ adId }) => ({
          id: adId,
        }),
      }),
      setDelivery: growthAction({
        description: "Start delivery",
        inputSchema: z.object({
          campaignId: z.string(),
        }),
        outputSchema: z.object({
          id: z.string(),
        }),
        execute: async ({ campaignId }) => ({
          id: campaignId,
        }),
      }),
    },
  }),
};
describe("operation discovery", () => {
  test("approval-required work cannot bypass approval through job scheduling", async () => {
    let scheduled = false;
    expect(
      startOperationJob(
        "adsWrite__setDelivery",
        operationTools(catalog, "test").adsWrite__setDelivery!,
        {
          campaignId: "campaign",
        },
        context,
        () => {
          scheduled = true;
        },
      ),
    ).rejects.toThrow("cannot execute");
    expect(scheduled).toBe(false);
  });
});
