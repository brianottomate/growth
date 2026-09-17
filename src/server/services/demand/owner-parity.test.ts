import { describe, expect, test } from "bun:test";

import { shouldMirrorDemandBdrChange } from "./owner-parity";

describe("demand__bdr → Customer.io loop guard", () => {
  test("a rep changing the BDR in the CRM is mirrored", () => {
    expect(shouldMirrorDemandBdrChange("CRM_UI")).toBe(true);
    expect(shouldMirrorDemandBdrChange("CRM_UI_BULK_ACTION")).toBe(true);
  });

  test("a HubSpot workflow rotating the BDR is mirrored", () => {
    expect(shouldMirrorDemandBdrChange("WORKFLOWS")).toBe(true);
  });

  test("our own sync writes echoing back are dropped", () => {
    expect(shouldMirrorDemandBdrChange("API")).toBe(false);
    expect(shouldMirrorDemandBdrChange("INTEGRATION")).toBe(false);
    expect(shouldMirrorDemandBdrChange("integration")).toBe(false);
  });

  test("an event with no recorded source is treated as ours", () => {
    expect(shouldMirrorDemandBdrChange(null)).toBe(false);
    expect(shouldMirrorDemandBdrChange(undefined)).toBe(false);
    expect(shouldMirrorDemandBdrChange("")).toBe(false);
  });
});
