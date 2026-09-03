import { describe, expect, test } from "bun:test";

import {
  AD_ACCOUNT_PLATFORMS,
  AD_PLATFORM_SPECS,
  adPlatformFromZernioString,
  channelPlatformForZernioKey,
  PLANNABLE_AD_PLATFORMS,
  PUSHABLE_AD_PLATFORMS,
  ZERNIO_AD_PLATFORMS,
  zernioAdPlatformKey,
} from "./ad-platforms";

const sorted = (values: readonly string[]) => [...values].sort();

describe("ad platform table", () => {
  test("the literal tuples restate the table", () => {
    const plannable = AD_PLATFORM_SPECS.filter(
      (spec) => spec.stage !== "catalog",
    );
    const pushable = AD_PLATFORM_SPECS.filter((spec) => spec.stage === "push");
    expect(sorted(PLANNABLE_AD_PLATFORMS)).toEqual(
      sorted(plannable.map((spec) => spec.platform)),
    );
    expect(sorted(PUSHABLE_AD_PLATFORMS)).toEqual(
      sorted(pushable.map((spec) => spec.platform)),
    );
    expect(sorted(ZERNIO_AD_PLATFORMS)).toEqual(
      sorted(pushable.map((spec) => spec.key)),
    );
    expect(sorted(AD_ACCOUNT_PLATFORMS)).toEqual(
      sorted(pushable.map((spec) => spec.zernio!.allowlistPlatform)),
    );
  });

  test("platforms, keys and Zernio names are unique", () => {
    const platforms = AD_PLATFORM_SPECS.map((spec) => spec.platform);
    const keys = AD_PLATFORM_SPECS.map((spec) => spec.key);
    // A platform may reuse a name across its own connection and tree (Meta is
    // "facebook" in both); two platforms must never share one.
    const names = AD_PLATFORM_SPECS.flatMap((spec) => [
      ...new Set([
        ...(spec.zernio?.connectionPlatforms ?? []),
        ...(spec.zernio ? [spec.zernio.treePlatform] : []),
      ]),
    ]);
    expect(new Set(platforms).size).toBe(platforms.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  test("no ads connection name is a social platform name", () => {
    const social = [
      "facebook",
      "instagram",
      "linkedin",
      "twitter",
      "x",
      "tiktok",
      "pinterest",
      "reddit",
      "youtube",
      "threads",
    ];
    for (const spec of AD_PLATFORM_SPECS) {
      for (const name of spec.zernio?.connectionPlatforms ?? []) {
        expect(social).not.toContain(name);
      }
    }
  });

  test("a pushable platform is reachable through Zernio and offers goals", () => {
    for (const platform of PUSHABLE_AD_PLATFORMS) {
      const spec = AD_PLATFORM_SPECS.find((row) => row.platform === platform)!;
      expect(spec.zernio).not.toBeNull();
      expect(spec.zernio!.connectTarget).toBeTruthy();
      expect(spec.features.goals.length).toBeGreaterThan(0);
      expect(spec.features.creativeAds || spec.features.textAds).toBe(true);
    }
  });

  test("maps every Zernio spelling of a paid platform, and no social one", () => {
    expect(adPlatformFromZernioString("linkedinads")).toBe("linkedin_ads");
    expect(adPlatformFromZernioString("linkedin")).toBe("linkedin_ads");
    expect(adPlatformFromZernioString("LinkedIn_Ads")).toBe("linkedin_ads");
    expect(adPlatformFromZernioString("facebook")).toBe("meta_ads");
    expect(adPlatformFromZernioString("metaads")).toBe("meta_ads");
    expect(adPlatformFromZernioString("googleads")).toBe("google_ads");
    expect(adPlatformFromZernioString("twitter")).toBe("x_ads");
    expect(adPlatformFromZernioString("instagram")).toBeUndefined();
    expect(adPlatformFromZernioString(undefined)).toBeUndefined();
  });

  test("round-trips between channel platform and Zernio key", () => {
    for (const platform of PUSHABLE_AD_PLATFORMS) {
      expect(channelPlatformForZernioKey(zernioAdPlatformKey(platform))).toBe(
        platform,
      );
    }
  });

  test("LinkedIn deep links point at Campaign Manager for the numeric account", () => {
    const spec = AD_PLATFORM_SPECS.find(
      (row) => row.platform === "linkedin_ads",
    )!;
    expect(spec.accountManageUrl("urn:li:sponsoredAccount:515601419")).toBe(
      "https://www.linkedin.com/campaignmanager/accounts/515601419/campaigns",
    );
  });
});
