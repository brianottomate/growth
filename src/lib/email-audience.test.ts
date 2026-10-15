import type { EmailAudienceRecipient } from "./email-audience";
import { describe, expect, test } from "bun:test";
import {
  assertEmailAudienceSource,
  emailAudienceDefinitionSchema,
  filterEmailAudienceBatch,
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
  test("case duplicates collapse and only explicit current approval passes", async () => {
    let checked: string[] = [];
    const kept = await filterEmailAudienceBatch(
      [
        row("A@example.com"),
        row("a@example.com"),
        row("b@example.com"),
        row("c@example.com"),
      ],
      async (emails) => {
        checked = emails;
        return new Map([
          ["a@example.com", true],
          ["b@example.com", false],
        ]);
      },
    );
    expect(checked).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
    expect(kept.map((r) => r.email)).toEqual(["a@example.com"]);
  });
  test("suppression service failure and oversized batches cannot bypass the gate", async () => {
    const unavailable = filterEmailAudienceBatch(
      [row("a@example.com")],
      async () => {
        throw new Error("Unavailable");
      },
    );
    expect(
      await unavailable.catch((e: unknown) =>
        e instanceof Error ? e.message : "",
      ),
    ).toBe("Unavailable");
    const oversized = filterEmailAudienceBatch(
      Array.from(
        {
          length: 10_001,
        },
        () => row("a@example.com"),
      ),
      async () => new Map(),
    );
    expect(
      await oversized.catch((e: unknown) =>
        e instanceof Error ? e.message : "",
      ),
    ).toContain("10,000");
  });
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
