import { createHmac } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  isOperatorLead,
  isQualified,
  leadContact,
  parseLeadgenWebhook,
  parseUnitCount,
  verifyMetaSignature,
} from "./meta-leadgen";

const field = (name: string, value: string) => ({ name, values: [value] });

describe("parseUnitCount — who counts as a qualified (10+) lead", () => {
  const conditional =
    "are_you_a_property_manager_with_more_than_5_vacation_rental_properties?";

  test("Sept conditional form buckets: 1-10 is not qualified, 10-199 is", () => {
    expect(isQualified(parseUnitCount([field(conditional, "1-10")]))).toBe(
      false,
    );
    expect(isQualified(parseUnitCount([field(conditional, "0")]))).toBe(false);
    expect(isQualified(parseUnitCount([field(conditional, "10-199")]))).toBe(
      true,
    );
    expect(isQualified(parseUnitCount([field(conditional, "2000+")]))).toBe(
      true,
    );
  });

  test("free-text ranges count by their low end", () => {
    expect(parseUnitCount([field("number_of_properties", "6-20")])).toBe(6);
    expect(parseUnitCount([field("número_de_propiedades", "21-50")])).toBe(21);
    expect(parseUnitCount([field("number_of_properties", "1,200 units")])).toBe(
      1200,
    );
  });

  test("a Yes/No gate carries no count; the free-text follow-up does", () => {
    const fields = [
      field(conditional, "Yes"),
      field("how_many_properties_do_you_currently_manage?", "14"),
    ];
    expect(parseUnitCount(fields)).toBe(14);
    expect(parseUnitCount([field(conditional, "Yes")])).toBeNull();
  });

  test("an upper bound is not a count at that bound", () => {
    for (const answer of [
      "<10",
      "less than 10",
      "under 15",
      "up to 20",
      "menos de 10",
    ]) {
      expect(
        isQualified(parseUnitCount([field("number_of_properties", answer)])),
      ).toBe(false);
    }
    expect(
      parseUnitCount([field("number_of_properties", "more than 10")]),
    ).toBe(10);
  });

  test("phone-number-sized junk is ignored", () => {
    expect(
      parseUnitCount([field("number_of_properties", "5551234567")]),
    ).toBeNull();
  });
});

describe("verifyMetaSignature", () => {
  const body = '{"object":"page"}';
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;

  test("accepts Meta's signature and rejects anything else", () => {
    expect(verifyMetaSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(`${body} `, sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, null, "s3cret")).toBe(false);
  });
});

test("parseLeadgenWebhook keeps leadgen changes only", () => {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "101399685529192",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: 123,
              page_id: "101399685529192",
              form_id: "9",
              created_time: 1,
            },
          },
          { field: "feed", value: {} },
        ],
      },
    ],
  });
  expect(parseLeadgenWebhook(body)).toEqual({
    notifications: [
      {
        leadgen_id: "123",
        page_id: "101399685529192",
        form_id: "9",
        created_time: 1,
      },
    ],
    dropped: 1,
  });
  expect(parseLeadgenWebhook("not json")).toEqual({
    notifications: [],
    dropped: 1,
  });
});

test("leadContact reads work_email, which the Spanish long form uses instead of email", () => {
  expect(
    leadContact([
      { name: "work_email", values: ["Ana@Example.mx "] },
      { name: "first_name", values: ["Ana"] },
    ]).email,
  ).toBe("ana@example.mx");
});

test("guest waitlist leads are not operator leads, so they are never routed", () => {
  expect(
    isOperatorLead([field("email", "a@b.com"), field("full_name", "A B")]),
  ).toBe(false);
  expect(
    isOperatorLead([
      field(
        "are_you_a_property_manager_with_more_than_5_vacation_rental_properties?_",
        "no",
      ),
    ]),
  ).toBe(true);
});

test("only a real booking site reaches HubSpot's company lookup", () => {
  const site = (answer: string) =>
    leadContact([field("share_your_direct_booking_site_url", answer)]).siteUrl;
  expect(site("www.watsonmountain.com")).toBe("www.watsonmountain.com");
  expect(site("https://www.airbnb.com/rooms/123")).toBeNull();
  expect(site("vrbo.com/12345")).toBeNull();
  expect(site("facebook.com/mycabins")).toBeNull();
  expect(site("i only have a listing on airbnb")).toBeNull();
  expect(site("none")).toBeNull();
});
