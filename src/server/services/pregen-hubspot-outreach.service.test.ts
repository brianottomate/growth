import { describe, expect, test } from "bun:test";

import type { CompanyEmailHistory } from "./hubspot-company-email-context.service";
import {
  hubspotPropertiesFromRenderedSteps,
  selectCompanyHistoryForGeneration,
} from "./pregen-hubspot-copy";

const item = (
  engagementId: string,
  subject: string,
  direction: "outbound" | "inbound",
  sentAt: string,
) => ({
  engagementId,
  subject,
  direction,
  sentAt,
  status: null,
  ownerId: null,
  body: `${subject} body`,
});

describe("selectCompanyHistoryForGeneration", () => {
  test("keeps inbound replies even when they are older than the recent window", () => {
    const history: CompanyEmailHistory = {
      companyId: "company-1",
      available: 20,
      retained: 20,
      inbound: 1,
      outbound: 19,
      items: [
        ...Array.from({ length: 18 }, (_, index) =>
          item(
            `recent-${index}`,
            `Recent ${index}`,
            "outbound",
            `2026-07-${String(24 - index).padStart(2, "0")}T10:00:00Z`,
          ),
        ),
        item(
          "reply",
          "Re: Cascadia + WanderOS",
          "inbound",
          "2026-06-26T10:00:00Z",
        ),
        item("old", "Old outbound", "outbound", "2026-06-20T10:00:00Z"),
      ],
    };

    const selected = selectCompanyHistoryForGeneration(history, 8);
    expect(selected.items).toHaveLength(8);
    expect(
      selected.items.some((candidate) => candidate.engagementId === "reply"),
    ).toBeTrue();
    expect(selected.inbound).toBe(1);
  });

  test("removes current pregen self-test messages", () => {
    const history: CompanyEmailHistory = {
      companyId: "company-1",
      available: 3,
      retained: 3,
      inbound: 0,
      outbound: 3,
      items: [
        item(
          "pilot",
          "A private direct-booking concept for Cascadia",
          "outbound",
          "2026-07-24T10:00:00Z",
        ),
        item("signature", "Signature test", "outbound", "2026-07-24T09:00:00Z"),
        item(
          "real",
          "Cascadia Getaways + WanderOS",
          "outbound",
          "2026-07-20T10:00:00Z",
        ),
      ],
    };

    const selected = selectCompanyHistoryForGeneration(history);
    expect(selected.items.map((candidate) => candidate.engagementId)).toEqual([
      "real",
    ]);
  });
});

describe("hubspotPropertiesFromRenderedSteps", () => {
  test("maps model-owned prose into HubSpot-owned paragraph slots", () => {
    const previewUrl = "https://preview.example/p/123";
    const properties = hubspotPropertiesFromRenderedSteps(
      [
        {
          subject: "A Cascadia preview",
          body: `Company-specific opening.\n\n${previewUrl}\n\nCompany-specific CTA.`,
          delayDays: 0,
        },
        {
          subject: null,
          body: "Product explanation.\n\nCompany-specific fit and CTA.",
          delayDays: 4,
        },
      ],
      previewUrl,
    );

    expect(properties).toEqual({
      growth_pregen_preview_url: previewUrl,
      growth_pregen_touch_1_subject: "A Cascadia preview",
      growth_pregen_touch_1_body: "Company-specific opening.",
      growth_pregen_touch_1_observation: "Company-specific CTA.",
      growth_pregen_touch_2_subject: "",
      growth_pregen_touch_2_body: "Product explanation.",
      growth_pregen_touch_2_fit: "Company-specific fit and CTA.",
    });
  });
});
