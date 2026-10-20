import type { EmailAudienceRecipient } from "./email-audience";
import { describe, expect, test } from "bun:test";
import {
  assertEmailAudienceSource,
  emailAudienceDefinitionSchema,
  emailAudienceCsvRow,
} from "./email-audience";
import { buildEmailAudienceQuery } from "@/server/services/email-audience-query";
const definition = emailAudienceDefinitionSchema.parse({
  source: "wander_cio",
});
const row = (email: string): EmailAudienceRecipient => ({
  email,
  first_name: "Test",
  source_id: "user-1",
  reason: "Selected",
});
describe("warehouse audience boundaries", () => {
  test("Customer.io population cannot be selected for a property manager", () => {
    expect(() =>
      assertEmailAudienceSource(definition, {
        slug: "winter-park",
        websiteId: "wpe",
      }),
    ).toThrow("only available");
    expect(() =>
      assertEmailAudienceSource(definition, {
        slug: "wander",
        websiteId: null,
      }),
    ).not.toThrow();
  });
  test("WanderOS needs a linked website and cannot claim click-history filtering", () => {
    const wos = {
      ...definition,
      source: "wanderos" as const,
      clickedWithinDays: null,
    };
    expect(() =>
      assertEmailAudienceSource(wos, {
        slug: "wpe",
        websiteId: null,
      }),
    ).toThrow("no WanderOS");
    expect(() =>
      assertEmailAudienceSource(
        {
          ...wos,
          clickedWithinDays: 90,
        },
        {
          slug: "wpe",
          websiteId: "wpe",
        },
      ),
    ).toThrow("Click history");
    const query = buildEmailAudienceQuery(wos, "website-a");
    expect(query.params).toEqual({
      websiteId: "website-a",
    });
    expect(query.sql).not.toContain("website-a");
  });
});
describe("current send eligibility", () => {
  test("CSV escapes quotes, embedded line breaks and spreadsheet formulas", () => {
    const csv = emailAudienceCsvRow({
      ...row("a@example.com"),
      first_name: "=1+1",
      reason: 'one,"two"\nthree',
    });
    expect(csv).toBe(
      '"a@example.com","\'=1+1","user-1","one,""two""\nthree"\r\n',
    );
  });
});
