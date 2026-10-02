import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { growthAction, growthDomainTool, growthTool } from "./tool";
import { assertOutputContract } from "./output-contract";
import { jsonValueSchema, normalizeGrowthJson } from "./output";
import { listPersonasOutputSchema } from "../capabilities/outputs/personas";
import { pushDraftActionOutputSchema } from "../capabilities/outputs/ads";
import type { Persona } from "@/server/db/brand-schema";
import { lifecycleWrite } from "../capabilities/lifecycle";

const context = {
  orgId: "org_test",
  userId: "user_test",
  runId: "run_test",
  surface: "test" as const,
};

describe("Growth output boundary", () => {
  test("normalizes persisted dates and validates nullable persona fields", async () => {
    const persona: Persona = {
      id: "pers_test",
      brandId: "brand_test",
      name: "Family trips",
      description: null,
      ageRanges: null,
      geographies: ["California"],
      demandGeography: { states: ["California"], source: null },
      notes: null,
      createdAt: new Date("2026-09-22T00:00:00.000Z"),
      updatedAt: new Date("2026-09-22T00:00:00.000Z"),
      deletedAt: null,
    };
    const tool = growthDomainTool({
      description: "Personas",
      actions: {
        list: growthAction({
          description: "List",
          inputSchema: z.object({}),
          outputSchema: listPersonasOutputSchema,
          execute: async () => [persona],
        }),
      },
    });
    const result = normalizeGrowthJson(
      await tool.run({ action: "list" }, context),
    );
    expect(result).toEqual({
      ok: true,
      action: "list",
      data: [
        {
          ...persona,
          deletedAt: null,
          demandGeography: { states: ["California"], source: null },
          createdAt: "2026-09-22T00:00:00.000Z",
          updatedAt: "2026-09-22T00:00:00.000Z",
        },
      ],
    });
    expect(tool.resultSchema.safeParse(result).success).toBe(true);
    expect(
      listPersonasOutputSchema.safeParse([
        { ...(normalizeGrowthJson(persona) as object), name: 7 },
      ]).success,
    ).toBe(false);
  });

  test("a successful result may carry its own error field", async () => {
    const tool = growthDomainTool({
      description: "Read",
      actions: {
        get: growthAction({
          description: "Get",
          inputSchema: z.object({}),
          outputSchema: z.object({ id: z.string(), error: z.string() }),
          execute: async () => ({ id: "vid_1", error: "Transcode failed" }),
        }),
      },
    });
    expect(await tool.run({ action: "get" }, context)).toMatchObject({
      ok: true,
      data: { id: "vid_1", error: "Transcode failed" },
    });
  });

  test("provider extension JSON survives alongside declared fields", async () => {
    const tool = growthTool({
      description: "Provider",
      inputSchema: z.object({}),
      resultSchema: z.object({
        ok: z.literal(true),
        provider: z
          .object({
            id: z.string(),
            metrics: z.object({ clicks: z.number() }),
            flags: z.array(z.string()),
          })
          .catchall(jsonValueSchema),
      }),
      execute: async () => ({
        ok: true,
        provider: {
          id: "provider-id",
          metrics: { clicks: 3 },
          flags: ["imported"],
          omitted: undefined,
        },
      }),
    });
    expect(normalizeGrowthJson(await tool.run({}, context))).toEqual({
      ok: true,
      provider: {
        id: "provider-id",
        metrics: { clicks: 3 },
        flags: ["imported"],
      },
    });
  });
});

test("output gate rejects unconstrained success data and nested placeholders", () => {
  expect(() => assertOutputContract("missing", z.unknown())).toThrow();
  expect(() => assertOutputContract("open-root", jsonValueSchema)).toThrow(
    "concrete required result",
  );
  expect(() =>
    assertOutputContract(
      "nested",
      z.object({ rows: z.array(z.object({ id: z.any() })) }),
    ),
  ).toThrow("no output shape");
  expect(() =>
    assertOutputContract(
      "extensions",
      z.object({ id: z.string(), metadata: jsonValueSchema }),
    ),
  ).not.toThrow();
});

test("ad push output distinguishes platform-specific receipts and rejects bad counts", () => {
  const output = {
    campaignId: "campaign",
    platform: "google_ads",
    validateOnly: true,
    platformCampaignRowId: "row",
    adSetsCreated: 1,
    adsCreated: 2,
    path: "/app/campaigns/campaign",
    warnings: [],
    provider: {
      validateOnly: true,
      providerExtension: { requestId: "receipt" },
    },
  };
  expect(pushDraftActionOutputSchema.safeParse(output).success).toBe(true);
  expect(
    pushDraftActionOutputSchema.safeParse({ ...output, adsCreated: "2" })
      .success,
  ).toBe(false);
});

test("lifecycle output binds each action to its result shape", () => {
  expect(
    lifecycleWrite.resultSchema.safeParse({
      ok: true,
      action: "createProgram",
      data: { step: { id: "step" }, url: "/app/lifecycle" },
    }).success,
  ).toBe(false);
});

test("brand projections exclude connection credentials and issuance details", async () => {
  const { brandForAssistant } = await import("../capabilities/brand-output");
  expect(
    brandForAssistant({
      id: "brand",
      name: "QA brand",
      connectToken: "private-token",
      connectTokenIssuedAt: new Date(),
      connectTokenIssuedByEmail: "private@example.com",
      connectTokenIssuedByName: "Private operator",
    }),
  ).toEqual({ id: "brand", name: "QA brand" });
  expect(() =>
    assertOutputContract(
      "leak",
      z.object({ brand: z.object({ connectToken: z.string() }) }),
    ),
  ).toThrow("connection credential");
});

test("brand projections retain current marketing DNS settings", async () => {
  const { brandForAssistant } = await import("../capabilities/brand-output");
  const emailSender = {
    fromName: "Wander",
    copyGuide: "Use plain language",
    marketingDomain: {
      rootDomain: "wander.com",
      sendingDomain: "post.wander.com",
      postmarkDomainId: 123,
      token: "a".repeat(32),
      createdAt: "2026-10-02T00:00:00.000Z",
      expiresAt: "2026-10-09T00:00:00.000Z",
    },
  };
  expect(
    brandForAssistant({
      connectToken: null,
      connectTokenIssuedAt: null,
      connectTokenIssuedByEmail: null,
      connectTokenIssuedByName: null,
      emailSender,
    }),
  ).toEqual({ emailSender });
});
