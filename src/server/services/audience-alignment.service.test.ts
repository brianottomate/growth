import { describe, expect, it } from "bun:test";

import { diffAudienceTarget } from "./audience-alignment.service";

const target = (
  overrides: Partial<Parameters<typeof diffAudienceTarget>[0]> = {},
) => ({
  id: "audt_1",
  name: "CA remote workers",
  status: "active" as const,
  priority: "must_have" as const,
  intendedChannels: ["meta_ads", "google_ads"],
  ...overrides,
});

describe("diffAudienceTarget", () => {
  it("live when a mirrored audience exists on an intended channel", () => {
    const a = diffAudienceTarget(
      target(),
      [],
      [{ platform: "meta_ads" }],
    );
    expect(a.channels.find((c) => c.platform === "meta_ads")?.verdict).toBe(
      "live",
    );
  });

  it("planned when only an activation exists", () => {
    const a = diffAudienceTarget(
      target(),
      [{ platform: "google_ads", status: "planned" }],
      [],
    );
    expect(a.channels.find((c) => c.platform === "google_ads")?.verdict).toBe(
      "planned",
    );
  });

  it("missing when neither mirror nor activation", () => {
    const a = diffAudienceTarget(target(), [], []);
    expect(a.channels.map((c) => c.verdict)).toEqual(["missing", "missing"]);
  });

  it("retired activations don't count as planned", () => {
    const a = diffAudienceTarget(
      target({ intendedChannels: ["x_ads"] }),
      [{ platform: "x_ads", status: "retired" }],
      [],
    );
    expect(a.channels[0]?.verdict).toBe("missing");
  });

  it("flags mirrored audiences on unintended platforms", () => {
    const a = diffAudienceTarget(
      target({ intendedChannels: ["meta_ads"] }),
      [],
      [{ platform: "meta_ads" }, { platform: "tiktok_ads" }],
    );
    expect(a.unplannedPlatforms).toEqual(["tiktok_ads"]);
  });

  it("fullyUnfulfilled only for must/should-have with no live coverage", () => {
    expect(diffAudienceTarget(target(), [], []).fullyUnfulfilled).toBe(true);
    expect(
      diffAudienceTarget(target({ priority: "nice_to_have" }), [], [])
        .fullyUnfulfilled,
    ).toBe(false);
    expect(
      diffAudienceTarget(target(), [], [{ platform: "meta_ads" }])
        .fullyUnfulfilled,
    ).toBe(false);
  });

  it("no intended channels → not unfulfilled, empty channels", () => {
    const a = diffAudienceTarget(target({ intendedChannels: null }), [], []);
    expect(a.channels).toEqual([]);
    expect(a.fullyUnfulfilled).toBe(false);
  });
});
