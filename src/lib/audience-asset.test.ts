import { describe, expect, test } from "bun:test";

import { targetedAsset, type TargetableAsset } from "./audience-asset";

const asset = (overrides: Partial<TargetableAsset>): TargetableAsset => ({
  id: "paud_1",
  name: "asset",
  externalId: "123",
  audienceId: null,
  personaId: null,
  channel: { platform: "meta_ads" },
  ...overrides,
});

describe("targetedAsset", () => {
  const audience = { id: "aud_1", personaId: "pers_1" };

  test("an asset linked to the campaign audience beats the persona's", () => {
    const hit = targetedAsset(
      audience,
      [
        asset({ id: "persona", personaId: "pers_1" }),
        asset({ id: "direct", audienceId: "aud_1" }),
      ],
      "meta_ads",
    );
    expect(hit?.asset.id).toBe("direct");
    expect(hit?.via).toBe("audience");
  });

  test("a persona's lookalike reaches every campaign audience derived from it", () => {
    const hit = targetedAsset(
      audience,
      [asset({ id: "lal", personaId: "pers_1" })],
      "meta_ads",
    );
    expect(hit?.asset.id).toBe("lal");
    expect(hit?.via).toBe("persona");
  });

  test("ignores assets on other platforms and ones Meta has not given an id", () => {
    expect(
      targetedAsset(
        audience,
        [
          asset({ personaId: "pers_1", channel: { platform: "google_ads" } }),
          asset({ personaId: "pers_1", externalId: null }),
        ],
        "meta_ads",
      ),
    ).toBeNull();
  });
});
