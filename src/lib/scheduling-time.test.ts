import { describe, expect, test } from "bun:test";

import {
  formatResolvedPublishingTime,
  resolveZonedDateTime,
} from "./scheduling-time";

describe("resolveZonedDateTime", () => {
  test("resolves Oslo summer wall-clock time to UTC", () => {
    expect(
      resolveZonedDateTime({
        localDateTime: "2026-08-11T12:00:00",
        timeZone: "Europe/Oslo",
      }),
    ).toBe("2026-08-11T10:00:00.000Z");
  });

  test("rejects a missing spring-forward time", () => {
    expect(() =>
      resolveZonedDateTime({
        localDateTime: "2026-03-29T02:30:00",
        timeZone: "Europe/Oslo",
      }),
    ).toThrow("does not exist");
  });

  test("rejects an ambiguous fall-back time", () => {
    expect(() =>
      resolveZonedDateTime({
        localDateTime: "2026-10-25T02:30:00",
        timeZone: "Europe/Oslo",
      }),
    ).toThrow("occurs twice");
  });

  test("renders the agreed timezone and canonical UTC", () => {
    expect(
      formatResolvedPublishingTime({
        localDateTime: "2026-08-11T12:00:00",
        timeZone: "Europe/Oslo",
        locale: "en-GB",
      }),
    ).toBe("11 Aug 2026 at 12:00 Europe/Oslo (11 Aug 2026 at 10:00 UTC)");
  });
});
