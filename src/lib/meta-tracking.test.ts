import { test, expect } from "bun:test";
import { applyMetaTrackingDefaults } from "./meta-tracking";
const defaults = { pixelId: "verified", customEventType: "PURCHASE" };
test("blank draft tracking inherits verified defaults, explicit choices win", () => {
  expect(
    applyMetaTrackingDefaults({ pixelId: "", customEventType: "" }, defaults),
  ).toEqual(defaults);
  expect(
    applyMetaTrackingDefaults(
      { pixelId: "custom", customEventType: "LEAD" },
      defaults,
    ),
  ).toEqual({ pixelId: "custom", customEventType: "LEAD" });
  expect(applyMetaTrackingDefaults({}, undefined).pixelId).toBeUndefined();
});
