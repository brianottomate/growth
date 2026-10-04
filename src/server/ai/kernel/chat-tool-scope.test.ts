import { expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { createChatToolScope } from "./chat-tool-scope";
import type { GrowthExecutionContext } from "./tool";
import { createChatWriteGate } from "./chat-write-gate";

const context: GrowthExecutionContext = {
  orgId: "wander",
  userId: "operator",
  surface: "test",
  runId: "scope-test",
};

const definition = tool({ inputSchema: z.object({}) });
const tools = Object.fromEntries(
  [
    "adsRead__catalogState",
    "adsRead__ideaContext",
    "adsWrite__saveIdea",
    "adsWrite__editCatalogCard",
    "adsWrite__push",
    "adsWrite__writeSetCopy",
    "emailRead__get",
    "brandRead__list",
  ].map((name) => [name, definition]),
);

test("catalog pages show catalog actions and can explicitly enable a different domain", async () => {
  const scope = createChatToolScope({
    tools,
    pagePath: "/app/performance/clients/cabins/catalog",
    continuation: { id: "u", role: "user", parts: [] },
  });
  expect(scope.activeTools()).toContain("adsWrite__editCatalogCard");
  expect(scope.activeTools()).not.toContain("adsWrite__push");
  expect(scope.activeTools()).not.toContain("emailRead__get");
  await scope.selectToolDomain.execute(
    { domain: "email" },
    { toolCallId: "scope", messages: [], context },
  );
  expect(scope.activeTools()).toContain("emailRead__get");
  await scope.selectToolDomain.execute(
    { domain: "performance" },
    { toolCallId: "scope2", messages: [], context },
  );
  expect(scope.activeTools()).toContain("adsWrite__push");
  expect(scope.activeTools()).not.toContain("adsWrite__writeSetCopy");
});

test("a scoped page can continue an already approved action without exposing batch edits", () => {
  const scope = createChatToolScope({
    tools,
    focus: "catalog",
    performance: true,
    continuation: {
      id: "a",
      role: "assistant",
      parts: [
        {
          type: "tool-adsWrite__push",
          toolCallId: "c",
          state: "approval-responded",
          input: { campaignId: "campaign" },
          approval: { id: "approval", approved: true },
        },
      ],
    },
  });
  expect(scope.activeTools()).toContain("adsWrite__push");
});

test("a step can read freely but cannot execute two mutations from the same model response", () => {
  const gate = createChatWriteGate();
  gate.beforeExecute("adsRead__ideaContext", {});
  gate.beforeExecute("adsWrite__saveIdea", {});
  gate.beforeExecute("adsRead__ideaContext", {});
  expect(() => gate.beforeExecute("adsWrite__editCatalogCard", {})).toThrow(
    "Only one edit",
  );
  gate.nextStep();
  expect(() =>
    gate.beforeExecute("adsWrite__editCatalogCard", {}),
  ).not.toThrow();
});

test("a pinned pitch conversation can read and save copy without enabling unrelated performance work", () => {
  const pitchTools = {
    ...tools,
    performanceRead__pitch: definition,
    performanceRead__draftPitch: definition,
    performanceWrite__savePitch: definition,
    researchRead__readPage: definition,
  };
  const scope = createChatToolScope({
    tools: pitchTools,
    pitch: true,
    continuation: { id: "u", role: "user", parts: [] },
  });
  for (const name of [
    "performanceRead__pitch",
    "performanceRead__draftPitch",
    "performanceWrite__savePitch",
  ]) {
    expect(scope.activeTools()).toContain(name);
  }
  expect(scope.activeTools()).not.toContain("adsWrite__push");
  expect(scope.activeTools()).toContain("researchRead__readPage");
});
