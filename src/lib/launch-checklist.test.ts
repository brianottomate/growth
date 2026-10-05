import { expect, test } from "bun:test";
import {
  applyLaunchPatch,
  emptyLaunchRecord,
  launchPatchSchema,
  recordedLaunchChecklist,
} from "./launch-checklist";
const stamp = {
  source: "workflow" as const,
  by: null,
  at: "2026-10-04T12:00:00Z",
  evidence: "run-1",
};
test("workflow retries do not overwrite later manual corrections", () => {
  const completed = applyLaunchPatch(
    emptyLaunchRecord(),
    [{ item: "live", checked: true }],
    stamp,
    "run-1",
  );
  const reopened = applyLaunchPatch(
    completed,
    [{ item: "live", checked: false }],
    { ...stamp, source: "manual", by: "user-a" },
  );
  expect(
    applyLaunchPatch(
      reopened,
      [{ item: "live", checked: true }],
      stamp,
      "run-1",
    ),
  ).toBe(reopened);
  expect(reopened.items.live?.checked).toBe(false);
  expect(reopened.history.map((event) => event.source)).toEqual([
    "workflow",
    "manual",
  ]);
});
test("bulk updates preserve other milestones and record provenance per item", () => {
  const current = applyLaunchPatch(
    emptyLaunchRecord(),
    [{ item: "mark", checked: true }],
    stamp,
  );
  const next = applyLaunchPatch(
    current,
    [
      { item: "intake", checked: true },
      { item: "budget", checked: false },
    ],
    { ...stamp, source: "assistant", by: "user-b" },
  );
  expect(next.items.mark?.checked).toBe(true);
  expect(next.items.intake?.by).toBe("user-b");
  expect(next.revision).toBe(2);
  expect(recordedLaunchChecklist(next).done).toBe(2);
});
test("new checklists have no inferred completions or claims about missing assets", () => {
  const checklist = recordedLaunchChecklist(emptyLaunchRecord());
  expect(checklist.done).toBe(0);
  expect(checklist.total).toBe(13);
  expect(
    checklist.groups
      .flatMap((group) => group.items)
      .every((item) => item.detail === "Not recorded"),
  ).toBe(true);
});
test("bulk input rejects duplicate and unknown milestone keys", () => {
  expect(
    launchPatchSchema.safeParse([
      { item: "live", checked: true },
      { item: "live", checked: false },
    ]).success,
  ).toBe(false);
  expect(
    launchPatchSchema.safeParse([{ item: "invented", checked: true }]).success,
  ).toBe(false);
});
