import type { MetaInsightRow } from "./spend-tracker.config";
import { describe, expect, it } from "bun:test";
import { resolveFixedCostsForMonth } from "./spend-tracker.config";
import { buildMetaDailyRows } from "./spend-tracker.meta-rows";
import {
  computeChannelPacing,
  mergeSpendBookingsAndFunnel,
} from "./spend-tracker.merge";

// =============================================================================
// Pacing — ported from wander-growth-tracker tests/unit/pacing.test.ts
// (Decisions #9j/#9k/#9l: project EOM off COMPLETED days only)
// =============================================================================

const JUNE = {
  currentDayOfMonth: 3,
  calendarDaysInMonth: 30,
}; // June 3, 30-day month

// $1,192.80/day → $35,784/mo (#9d)

describe("computeChannelPacing — ad (variable) channels", () => {
  it("uses spendThroughYesterday / (dayOfMonth-1), NOT the diluted /dayOfMonth (#9l)", () => {
    const throughYesterday = 3485 + 3874;
    const pacing = computeChannelPacing(
      {
        dataSource: "meta_api",
        spend: throughYesterday + 848,
        spendThroughYesterday: throughYesterday,
        completedFixedDays: 0,
      },
      JUNE,
    );
    expect(pacing).toBeCloseTo((throughYesterday / 2) * 30, 2); // $110,385 true run-rate
    expect(pacing).not.toBeCloseTo(((throughYesterday + 848) / 3) * 30, 2); // NOT $82,066
  });
  it("returns null on the 1st of the month", () => {
    expect(
      computeChannelPacing(
        {
          dataSource: "meta_api",
          spend: 848,
          spendThroughYesterday: 0,
          completedFixedDays: 0,
        },
        {
          currentDayOfMonth: 1,
          calendarDaysInMonth: 30,
        },
      ),
    ).toBeNull();
  });
});

// =============================================================================
// Marketplace filter — ported from tests/unit/marketplace-filter.test.ts
// (Decision #9m: denylist, fail-pessimistic)
// =============================================================================

describe("buildMetaDailyRows — marketplace filter + daily grouping", () => {
  const day = (
    campaign: string,
    date: string,
    spend: number,
    purchases28 = 0,
    purchases1 = 0,
    value28 = 0,
    value1 = 0,
  ) => ({
    date_start: date,
    date_stop: date,
    campaign_name: campaign,
    spend: String(spend),
    clicks: "10",
    impressions: "100",
    actions: [
      {
        action_type: "purchase",
        "28d_click": String(purchases28),
        "1d_view": String(purchases1),
      },
    ],
    action_values: [
      {
        action_type: "purchase",
        "28d_click": String(value28),
        "1d_view": String(value1),
      },
    ],
  });
  it("re-sums grouped daily totals to Marketplace-only spend", () => {
    const rows = buildMetaDailyRows([
      day("Marketplace_A", "2026-06-01", 600),
      day("Marketplace_B", "2026-06-01", 400),
      day("WanderOS_LeadForm", "2026-06-01", 600),
      // excluded
      day("Marketplace_A", "2026-06-02", 500),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.date).toBe("2026-06-01");
    expect(rows[0]!.spend).toBe(1000); // NOT 1600
    expect(rows[1]!.spend).toBe(500);
  });
});

// =============================================================================
// Fixed-cost resolver + pro-ration
// =============================================================================

describe("resolveFixedCostsForMonth", () => {
  it("latest effective month ≤ target wins and carries forward", () => {
    const may = resolveFixedCostsForMonth("2026-05");
    const seoMay = may.find((f) => f.category === "seo");
    expect(seoMay?.monthlyAmount).toBe(10_000); // Kyle May 4 override

    const june = resolveFixedCostsForMonth("2026-06");
    const seoJune = june.find((f) => f.category === "seo");
    expect(seoJune?.monthlyAmount).toBe(0); // migration 014 — SEO cut June+

    const july = resolveFixedCostsForMonth("2026-07");
    expect(july.find((f) => f.category === "seo")?.monthlyAmount).toBe(0); // carries forward
    expect(july.find((f) => f.category === "influencer")?.monthlyAmount).toBe(
      1_000,
    );
    const august = resolveFixedCostsForMonth("2026-08");
    expect(august.find((f) => f.category === "influencer")?.monthlyAmount).toBe(
      0,
    );

    // Kyle Slack 2026-07-23: AP affiliate + Comcast paused from August.
    expect(august.find((f) => f.category === "affiliate")?.monthlyAmount).toBe(
      0,
    );
    expect(august.find((f) => f.category === "tv_linear")?.monthlyAmount).toBe(
      0,
    );
    // July untouched by the August overrides.
    expect(july.find((f) => f.category === "affiliate")?.monthlyAmount).toBe(
      10_000,
    );
    expect(july.find((f) => f.category === "tv_linear")?.monthlyAmount).toBe(
      12_900,
    );
  });
});
// =============================================================================
// Merge
// =============================================================================

describe("mergeSpendBookingsAndFunnel", () => {
  it("skips BQ Meta spend and applies Meta API per-day overrides", () => {
    const metaRow: MetaInsightRow = {
      date: "2026-06-01",
      spend: 3500,
      clicks: 2000,
      impressions: 150000,
      bookings28dClick: 3,
      bookings1dView: 1,
      totalBookings: 4,
      purchaseValue28dClick: 20000,
      purchaseValue1dView: 5000,
      totalPurchaseValue: 25000,
    };
    const merged = mergeSpendBookingsAndFunnel(
      [
        {
          date: "2026-06-01",
          platform: "Meta",
          spend: 9999,
          clicks: 1,
          impressions: 1,
        },
        // must be skipped
        {
          date: "2026-06-01",
          platform: "Google",
          spend: 450,
          clicks: 500,
          impressions: 2000,
        },
      ],
      [
        {
          date: "2026-06-01",
          channel: "meta",
          bookings: 1,
          // BQ last-touch — overridden by API
          gmv: 4000,
          take_rate_revenue: 800,
          points_used: 0,
          coupon_off: 0,
          direct_bookings: 1,
          ota_bookings: 0,
        },
      ],
      [],
      [metaRow],
    );
    const meta = merged.find((r) => r.channel === "meta");
    expect(meta?.spend).toBe(3500); // API, not BQ 9999
    expect(meta?.bookings).toBe(4); // 28d+1d, not BQ last-touch 1
    expect(meta?.gmv).toBe(25000);
    expect(meta?.takeRateRevenue).toBe(800); // ALWAYS BQ — never overridden
    expect(meta?.dataSource).toBe("meta_api");
    expect(meta?.attribution).toBe("view_click");
    const google = merged.find((r) => r.channel === "google");
    expect(google?.spend).toBe(450);
    expect(google?.dataSource).toBe("bigquery"); // no Google API in v1
    expect(google?.attribution).toBe("data_driven"); // hierarchy attribution retained
  });
  it("keeps Meta BQ bookings on days without API data (per-day fallback)", () => {
    const merged = mergeSpendBookingsAndFunnel(
      [],
      [
        {
          date: "2026-06-01",
          channel: "meta",
          bookings: 2,
          gmv: 8000,
          take_rate_revenue: 1600,
          points_used: 0,
          coupon_off: 0,
          direct_bookings: 2,
          ota_bookings: 0,
        },
      ],
      [],
      [], // Meta API returned nothing
    );
    const meta = merged.find((r) => r.channel === "meta");
    expect(meta?.bookings).toBe(2);
    expect(meta?.dataSource).toBe("bigquery");
  });
  it("skips BQ ad-network spend for fixed-cost channels (no double count)", () => {
    const merged = mergeSpendBookingsAndFunnel(
      [
        {
          date: "2026-06-01",
          platform: "Influencer",
          spend: 1293,
          clicks: 0,
          impressions: 0,
        },
      ],
      [
        {
          date: "2026-06-01",
          channel: "influencer",
          bookings: 1,
          gmv: 3000,
          take_rate_revenue: 600,
          points_used: 0,
          coupon_off: 0,
          direct_bookings: 1,
          ota_bookings: 0,
        },
      ],
      [],
      [],
    );
    const inf = merged.find((r) => r.channel === "influencer");
    expect(inf?.spend).toBe(0); // spend comes ONLY from fixed costs
    expect(inf?.bookings).toBe(1); // BQ bookings preserved (tracker lost these)
  });
  it("applies Google connector overrides per day (data-driven)", () => {
    const merged = mergeSpendBookingsAndFunnel(
      [
        {
          date: "2026-06-01",
          platform: "Google",
          spend: 450,
          clicks: 500,
          impressions: 2000,
        },
        {
          date: "2026-06-02",
          platform: "Google",
          spend: 470,
          clicks: 480,
          impressions: 2100,
        },
      ],
      [],
      [],
      [],
      [
        // connector has data for Jun 1 only — Jun 2 keeps the BQ baseline
        {
          date: "2026-06-01",
          spend: 430,
          clicks: 490,
          impressions: 1900,
          conversions: 3,
          conversionsValue: 12000,
        },
      ],
    );
    const jun1 = merged.find(
      (r) => r.channel === "google" && r.date === "2026-06-01",
    );
    const jun2 = merged.find(
      (r) => r.channel === "google" && r.date === "2026-06-02",
    );
    expect(jun1?.spend).toBe(430); // API override
    expect(jun1?.bookings).toBe(3);
    expect(jun1?.gmv).toBe(12000);
    expect(jun1?.dataSource).toBe("google_api");
    expect(jun1?.attribution).toBe("data_driven");
    expect(jun2?.spend).toBe(470); // BQ baseline kept (per-day fallback)
    expect(jun2?.dataSource).toBe("bigquery");
  });
});
