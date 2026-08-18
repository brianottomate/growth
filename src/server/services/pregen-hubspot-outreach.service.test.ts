import { describe, expect, test } from "bun:test";

import type { CompanyEmailHistory } from "./hubspot-company-email-context.service";
import {
  hubspotCompanyPropertiesFromRenderedSteps,
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
  operatorTest: false,
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

  test("removes operator self-test correspondence", () => {
    const operatorTest = {
      ...item(
        "operator-test",
        "A concrete answer to Ryan's WanderOS question",
        "outbound" as const,
        "2026-07-24T19:14:00Z",
      ),
      operatorTest: true,
    };
    const history: CompanyEmailHistory = {
      companyId: "company-1",
      available: 2,
      retained: 2,
      inbound: 0,
      outbound: 2,
      items: [
        operatorTest,
        item("real", "Ryan + WanderOS", "outbound", "2026-06-20T10:00:00Z"),
      ],
    };

    const selected = selectCompanyHistoryForGeneration(history);
    expect(selected.items.map((candidate) => candidate.engagementId)).toEqual([
      "real",
    ]);
  });
});

describe("hubspotCompanyPropertiesFromRenderedSteps", () => {
  // The contact contract this replaced carried two touches, so publishing a
  // four-touch draft silently dropped half of what the reviewer approved.
  test("carries all four touches", () => {
    const link = "https://www.wander.com/os/maui-westside-properties?t=abc";
    const properties = hubspotCompanyPropertiesFromRenderedSteps([
      {
        subject: "Maui Westside on WanderOS",
        body: `Opening.\n\n${link}\n\nCTA.`,
        delayDays: 0,
      },
      { subject: null, body: "Touch two.", delayDays: 3 },
      { subject: null, body: "Touch three.", delayDays: 7 },
      { subject: null, body: "Touch four.", delayDays: 12 },
    ]);

    expect(properties).toEqual({
      growth_pregen_touch_1_subject: "Maui Westside on WanderOS",
      growth_pregen_touch_1_opening: "Opening.",
      growth_pregen_touch_1_closing: "CTA.",
      growth_pregen_touch_2_body: "Touch two.",
      growth_pregen_touch_3_body: "Touch three.",
      growth_pregen_touch_4_body: "Touch four.",
    });
  });

  // The link is a separate company property so the sequence step can render a
  // hyperlink, which means touch 1 has to split around it. Locating that line
  // by shape rather than by matching a URL the caller supplies is what keeps
  // attribution parameters from breaking publish.
  test("splits touch 1 around an attributed link line", () => {
    const link =
      "https://www.wander.com/os/maui?t=abc&utm_source=hubspot_sequence&utm_content=mauiwestside.com";
    const properties = hubspotCompanyPropertiesFromRenderedSteps([
      {
        subject: "S",
        body: `Line one.\n\nLine two.\n\n${link}\n\nClosing question?`,
        delayDays: 0,
      },
    ]);

    expect(properties.growth_pregen_touch_1_opening).toBe(
      "Line one.\n\nLine two.",
    );
    expect(properties.growth_pregen_touch_1_closing).toBe("Closing question?");
    expect(properties.growth_pregen_touch_2_body).toBe("");
  });

  test("refuses touch 1 with no link line", () => {
    expect(() =>
      hubspotCompanyPropertiesFromRenderedSteps([
        { subject: "S", body: "Opening.\n\nClosing.", delayDays: 0 },
      ]),
    ).toThrow();
  });
});
