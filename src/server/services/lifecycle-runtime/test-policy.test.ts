import { expect, test } from "bun:test";
import type { LifecycleExecutionSnapshot } from "@/lib/validators/lifecycle-runtime";
import { canRunJourney } from "./test-policy";

test("paused execution is bypassed only by a frozen test revision bound to its recipient", () => {
  const snapshot = {
    settings: {},
    steps: [],
  } as unknown as LifecycleExecutionSnapshot;
  const paused = { enabled: false, runtimeId: "prod" };
  expect(canRunJourney(snapshot, "me@wander.com", paused, "prod")).toBe(false);
  expect(
    canRunJourney(
      snapshot,
      "me@wander.com",
      { enabled: true, runtimeId: "preview" },
      "prod",
    ),
  ).toBe(false);
  expect(
    canRunJourney(
      snapshot,
      "me@wander.com",
      { enabled: true, runtimeId: "prod" },
      "prod",
    ),
  ).toBe(true);
  const testRevision = {
    ...snapshot,
    test: { email: "me@wander.com", attributes: {} },
  };
  expect(canRunJourney(testRevision, "me@wander.com", paused, "prod")).toBe(
    true,
  );
  expect(
    canRunJourney(testRevision, "someone-else@wander.com", paused, "prod"),
  ).toBe(false);
  expect(
    canRunJourney(
      testRevision,
      "someone-else@wander.com",
      { enabled: true, runtimeId: "prod" },
      "prod",
    ),
  ).toBe(false);
});
