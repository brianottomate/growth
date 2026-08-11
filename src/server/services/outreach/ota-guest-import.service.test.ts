import { describe, expect, it } from "bun:test";

import {
  buildCustomFields,
  buildNote,
  buildTags,
  cleanPhone,
  dedupeByEmail,
  parseOtaGuestCsv,
  skipReason,
  splitName,
  type OtaGuestRow,
} from "./ota-guest-import.service";

const HEADER =
  "guest_name,guest_email,guest_phone,ota_channels,ota_bookings,first_checkin,last_checkin,total_booking_value,properties,ota_codes";

function row(overrides: Partial<OtaGuestRow> = {}): OtaGuestRow {
  return {
    guestName: "Miguel Mancha",
    guestEmail: "migueljm28@gmail.com",
    guestPhone: "+14077564991",
    otaChannels: "airbnb",
    otaBookings: 4,
    firstCheckin: "2024-04-08",
    lastCheckin: "2025-01-28",
    totalBookingValue: 14162.48,
    properties: "Wander Ponte Vedra",
    otaCodes: "HM4Y4YSTTM",
    ...overrides,
  };
}

describe("parseOtaGuestCsv", () => {
  it("reads quoted fields containing commas without shifting columns", () => {
    const csv = `${HEADER}\nGreg Kay,mghkayfam@gmail.com,+19047553500,airbnb,3,2024-04-26,2024-05-09,14928.76,"Wander Anchor Bay,Wander Anchor Cove","HM5ZXQACSX,HMF83QB925"\n`;
    const [parsed] = parseOtaGuestCsv(csv);

    expect(parsed?.guestEmail).toBe("mghkayfam@gmail.com");
    expect(parsed?.totalBookingValue).toBe(14928.76);
    expect(parsed?.properties).toBe("Wander Anchor Bay,Wander Anchor Cove");
  });

  it("maps by header name so a re-ordered export still lands in the right field", () => {
    const csv =
      "guest_email,guest_name,ota_codes,properties,total_booking_value,last_checkin,first_checkin,ota_bookings,ota_channels,guest_phone\n" +
      "a@b.com,Ann Bee,HM1,Wander Dunes,900,2025-02-02,2025-01-01,2,vrbo,+15551234567\n";
    const [parsed] = parseOtaGuestCsv(csv);

    expect(parsed?.guestName).toBe("Ann Bee");
    expect(parsed?.otaChannels).toBe("vrbo");
    expect(parsed?.otaBookings).toBe(2);
  });

  it("fails loudly when the export is missing a required column", () => {
    expect(() => parseOtaGuestCsv("guest_email\na@b.com\n")).toThrow(/missing required column/i);
  });
});

describe("skipReason", () => {
  it("keeps a real guest", () => {
    expect(skipReason(row())).toBeNull();
  });

  it("drops rows we must never push to Outreach", () => {
    expect(skipReason(row({ guestEmail: "" }))).toBe("no email");
    expect(skipReason(row({ guestEmail: "blocks@wander.com" }))).toBe("placeholder guest account");
    expect(skipReason(row({ guestEmail: "kristian@wander.com" }))).toBe("internal employee");
    expect(skipReason(row({ guestEmail: "not-an-email" }))).toBe("malformed email");
  });
});

describe("dedupeByEmail", () => {
  it("merges the same guest across channels into one prospect payload", () => {
    const { guests, skipped } = dedupeByEmail([
      row({ otaChannels: "airbnb", otaBookings: 2, totalBookingValue: 1000, lastCheckin: "2024-06-01", properties: "Wander Ponte Vedra" }),
      row({ otaChannels: "vrbo", otaBookings: 1, totalBookingValue: 500, firstCheckin: "2023-01-01", lastCheckin: "2025-07-04", properties: "Wander Dunes" }),
      row({ guestEmail: "adapt@wander.com" }),
    ]);

    expect(skipped).toHaveLength(1);
    expect(guests).toHaveLength(1);
    expect(guests[0]?.channels).toEqual(["airbnb", "vrbo"]);
    expect(guests[0]?.bookings).toBe(3);
    expect(guests[0]?.totalBookingValue).toBe(1500);
    expect(guests[0]?.firstCheckin).toBe("2023-01-01");
    expect(guests[0]?.lastCheckin).toBe("2025-07-04");
    expect(guests[0]?.properties).toEqual(["Wander Ponte Vedra", "Wander Dunes"]);
  });
});

describe("prospect payload", () => {
  it("always carries the campaign tag and preserves tags already on the prospect", () => {
    const [guest] = dedupeByEmail([row({ otaChannels: "airbnb,vrbo" })]).guests;
    const tags = buildTags(guest!, "OTA_Guest_8/26", {
      existingTags: ["Abandoned Cart"],
      channelTags: true,
    });

    expect(tags).toContain("Abandoned Cart");
    expect(tags).toContain("OTA_Guest_8/26");
    expect(tags).toContain("OTA Guest");
    expect(tags).toContain("OTA-Airbnb");
    expect(tags).toContain("OTA-Vrbo");
  });

  it("writes booking context a BDR can act on", () => {
    const [guest] = dedupeByEmail([row()]).guests;
    const note = buildNote(guest!);

    expect(note).toContain("4 confirmed stay(s) via Airbnb");
    expect(note).toContain("Wander Ponte Vedra");
    expect(note).toContain("HM4Y4YSTTM");
  });

  it("maps booking stats onto the demand custom fields", () => {
    const [guest] = dedupeByEmail([row()]).guests;
    const fields = buildCustomFields(guest!, "OTA_Guest_8/26");

    expect(fields.custom27).toBe("4"); // number_of_bookings
    expect(fields.custom24).toBe("14162"); // total_money_spent
    expect(fields.custom50).toBe("OTA_Guest_8/26"); // last_sync_tag
    expect(fields.custom60).toBe("Wander Ponte Vedra"); // last_property_booked
  });

  it("normalizes phones and names", () => {
    expect(cleanPhone("+1 (407) 756-4991")).toBe("+14077564991");
    expect(cleanPhone("N/A")).toBeNull();
    expect(splitName("Maria Del Rio")).toEqual({ firstName: "Maria", lastName: "Del Rio" });
    expect(splitName("")).toEqual({ firstName: null, lastName: null });
  });
});
