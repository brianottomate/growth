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
test("bulk updates preserve other milestones and record provenance per item", () => {
  const current = applyLaunchPatch(
    emptyLaunchRecord(),
    [{ item: "signed", checked: true }],
    stamp,
  );
  const next = applyLaunchPatch(
    current,
    [
      { item: "invoice_sent", checked: true },
      { item: "budget", checked: false },
    ],
    { ...stamp, source: "assistant", by: "user-b" },
  );
  expect(next.items.signed?.checked).toBe(true);
  expect(next.items.invoice_sent?.by).toBe("user-b");
  expect(next.revision).toBe(2);
  expect(recordedLaunchChecklist(next).done).toBe(2);
});
test("new checklists have no inferred completions or claims about missing assets", () => {
  const checklist = recordedLaunchChecklist(emptyLaunchRecord());
  expect(checklist.done).toBe(0);
  expect(checklist.total).toBe(11);
  expect(
    checklist.groups
      .flatMap((group) => group.items)
      .filter((item) => !item.observed)
      .every((item) => item.detail === "Not recorded"),
  ).toBe(true);
});
test("bulk input rejects duplicate and unknown milestone keys", () => {
  expect(
    launchPatchSchema.safeParse([
      { item: "signed", checked: true },
      { item: "signed", checked: false },
    ]).success,
  ).toBe(false);
  expect(
    launchPatchSchema.safeParse([{ item: "invented", checked: true }]).success,
  ).toBe(false);
});
