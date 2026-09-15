import { describe, expect, test } from "bun:test";

import {
  BUSINESS_STAGES,
  DELIVERY_STAGES,
  LEGACY_SPLIT,
  LEGACY_STAGES,
  isClientStage,
  isClosedStage,
  laterStage,
} from "./performance-stage";

describe("legacy split", () => {
  test("every old stage lands on a real pair", () => {
    for (const stage of LEGACY_STAGES) {
      const pair = LEGACY_SPLIT[stage];
      expect(BUSINESS_STAGES).toContain(pair.business);
      expect(DELIVERY_STAGES).toContain(pair.delivery);
    }
  });

  test("everything past signed keeps the signature", () => {
    for (const stage of [
      "intake_submitted",
      "access_verified",
      "ads_review",
      "live",
      "paused",
    ] as const) {
      expect(LEGACY_SPLIT[stage].business).toBe("signed");
    }
  });

  test("closed stages stay closed and nothing before signed becomes a client", () => {
    expect(isClosedStage(LEGACY_SPLIT.lost.business)).toBe(true);
    expect(isClosedStage(LEGACY_SPLIT.churned.business)).toBe(true);
    for (const stage of [
      "ready_to_pitch",
      "pitch_sent",
      "meeting_booked",
      "ready_for_intake",
      "intake_sent",
    ] as const) {
      expect(isClientStage(LEGACY_SPLIT[stage].business)).toBe(false);
    }
  });
});

describe("laterStage", () => {
  test("never walks backwards within one lifecycle", () => {
    expect(laterStage(DELIVERY_STAGES, "live", "intake_submitted")).toBe(
      "live",
    );
    expect(laterStage(DELIVERY_STAGES, "intake_sent", "access_verified")).toBe(
      "access_verified",
    );
    expect(laterStage(BUSINESS_STAGES, null, "signed")).toBe("signed");
    expect(laterStage(BUSINESS_STAGES, "paid", "signed")).toBe("paid");
  });
});

describe("client line", () => {
  test("signed, paid and paused are clients; the rest are not", () => {
    expect(isClientStage("signed")).toBe(true);
    expect(isClientStage("paid")).toBe(true);
    expect(isClientStage("paused")).toBe(true);
    expect(isClientStage("meeting_booked")).toBe(false);
    expect(isClientStage("churned")).toBe(false);
  });
});
