import { expect, test } from "bun:test";
import { intakeSetupSummary } from "./intake-setup-status";
import type { PerformanceConnectionSummary } from "./performance-connections";

const connection: PerformanceConnectionSummary = {
  profile: "connected",
  meta: "ready",
  billing: "present",
  route: "private-owner-label",
  clientSetupComplete: true,
  pixelId: "123456789012345",
  sitePixelIds: ["123456789012345"],
  customerPixelId: "123456789012345",
};

test("private intake status projects readiness without exposing provider identifiers", () => {
  const status = intakeSetupSummary(connection, "verified", "connected");
  expect(status.ready).toBe(true);
  expect(JSON.stringify(status)).not.toContain(connection.pixelId!);
  expect(JSON.stringify(status)).not.toContain(connection.route);
});

test("unreadable billing and another site's pixels never count as setup ready", () => {
  const status = intakeSetupSummary(
    { ...connection, billing: "unknown", sitePixelIds: ["other-pixel"] },
    "unknown",
    "unknown",
  );
  expect(status.ready).toBe(false);
  expect(status.checks.find((c) => c.key === "billing")?.state).toBe("unknown");
  expect(status.checks.find((c) => c.key === "pixel")?.state).toBe("pending");
  expect(status.checks.find((c) => c.key === "email")?.state).toBe("unknown");
});
