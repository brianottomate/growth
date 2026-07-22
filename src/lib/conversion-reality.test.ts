import { describe, expect, test } from "bun:test";

import { findConversionRealityIssues } from "./conversion-reality";

const intent = (
  overrides: Partial<{ id: string; name: string; isPrimary: boolean }> = {},
) => ({
  id: "event_purchase",
  name: "Purchase",
  isPrimary: true,
  ...overrides,
});

const mapping = (
  overrides: Partial<{
    id: string;
    platform: string;
    platformEventName: string;
    externalConversionId: string | null;
    status: "wanted" | "not_implemented" | "verified";
    channelId: string | null;
    channel: { externalId: string | null } | null;
    sources: { conversionEventId: string }[];
  }> = {},
) => ({
  id: "mapping_purchase",
  platform: "google_ads",
  platformEventName: "Purchase",
  externalConversionId: "7137653171",
  status: "verified" as const,
  channelId: "channel_demand",
  channel: { externalId: "325-444-9027" },
  sources: [{ conversionEventId: "event_purchase" }],
  ...overrides,
});

describe("conversion reality findings", () => {
  test("flags missing primary mappings without mutating provider state", () => {
    const findings = findConversionRealityIssues([intent()], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("missing_primary_mapping");
    expect(findings[0]?.severity).toBe("high");
  });

  test("recognizes cleanup labels and implementation status", () => {
    const findings = findConversionRealityIssues(
      [intent()],
      [
        mapping({
          id: "mapping_delete",
          platformEventName: "[DELETE] Purchase GTM",
          status: "not_implemented",
        }),
      ],
    );
    expect(findings.map((finding) => finding.kind).sort()).toEqual([
      "delete_label",
      "not_implemented",
    ]);
  });

  test("detects duplicate provider IDs and similarly named actions", () => {
    const findings = findConversionRealityIssues(
      [intent()],
      [
        mapping({ id: "mapping_a", externalConversionId: "provider_a" }),
        mapping({ id: "mapping_b", externalConversionId: "provider_a" }),
        mapping({
          id: "mapping_c",
          externalConversionId: "provider_c",
          platformEventName: " purchase ",
        }),
      ],
    );
    expect(
      findings.some((finding) => finding.kind === "duplicate_external_id"),
    ).toBe(true);
    expect(findings.some((finding) => finding.kind === "duplicate_name")).toBe(
      true,
    );
  });

  test("returns no findings for one verified mapped primary", () => {
    expect(findConversionRealityIssues([intent()], [mapping()])).toEqual([]);
  });
});
