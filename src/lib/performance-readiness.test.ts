import { describe, expect, test } from "bun:test";

import {
  readinessChecklist,
  type ReadinessFacts,
} from "./performance-readiness";

const nothing: ReadinessFacts = {
  intakeFiled: false,
  mediaBudget: null,
  accessVerified: false,
  accessClaimed: false,
  homesOnRecord: 0,
  homesAll: false,
  hasMark: false,
  reportEmails: false,
  invoiceEmail: false,
  creativeFolder: false,
  previewsKept: 0,
  adsDrafted: 0,
  campaigns: 0,
  audiences: 0,
  lookalikes: 0,
  pushed: false,
  live: false,
};

describe("readinessChecklist", () => {
  test("a fresh client has nothing ticked", () => {
    const list = readinessChecklist(nothing);
    expect(list.done).toBe(0);
    expect(list.total).toBe(13);
    expect(list.groups.map((group) => group.done)).toEqual([0, 0, 0]);
  });

  test("'all of them' on the intake is not homes on record", () => {
    // The intake is a receipt; the tick follows the property rows, which are
    // what the ads draw from. Saying "all" names nothing until the feed is read.
    const list = readinessChecklist({
      ...nothing,
      intakeFiled: true,
      homesAll: true,
    });
    const homes = list.groups[0]!.items.find((item) => item.id === "homes")!;
    expect(homes.done).toBe(false);
    expect(homes.detail).toContain("none on record");
  });

  test("access claimed on the intake does not count as verified", () => {
    const list = readinessChecklist({ ...nothing, accessClaimed: true });
    const access = list.groups[0]!.items.find((item) => item.id === "access")!;
    expect(access.done).toBe(false);
    expect(access.detail).toBe("Claimed on the intake, not seen yet");
  });

  test("a finished phase reads as done, and so does a finished list", () => {
    const onboarded: ReadinessFacts = {
      ...nothing,
      intakeFiled: true,
      mediaBudget: 10_000,
      accessVerified: true,
      homesOnRecord: 5,
      reportEmails: true,
      invoiceEmail: true,
    };
    const partly = readinessChecklist(onboarded);
    expect(partly.groups[0]!.done).toBe(partly.groups[0]!.total);
    expect(partly.groups[1]!.done).toBeLessThan(partly.groups[1]!.total);

    const everything: ReadinessFacts = {
      ...onboarded,
      hasMark: true,
      creativeFolder: true,
      previewsKept: 3,
      adsDrafted: 10,
      campaigns: 1,
      audiences: 2,
      lookalikes: 1,
      pushed: true,
      live: true,
    };
    const list = readinessChecklist(everything);
    expect(list.done).toBe(list.total);
    expect(list.groups.every((group) => group.done === group.total)).toBe(true);
  });

  test("an audience without a lookalike says so, because the lookalike goes first", () => {
    const list = readinessChecklist({ ...nothing, audiences: 1 });
    const audience = list.groups[2]!.items.find(
      (item) => item.id === "audience",
    )!;
    expect(audience.done).toBe(true);
    expect(audience.detail).toBe("1 audience, no lookalike");
  });
});
