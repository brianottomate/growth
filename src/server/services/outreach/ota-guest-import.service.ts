/**
 * ota-guest-import.service.ts — pure logic for importing a warehouse list of
 * past OTA bookers (Airbnb / Vrbo / Booking.com guests who stayed in a
 * wander.com home) into the demand Outreach pipeline as tagged prospects.
 *
 * The CLI wrapper lives in `scripts/import-ota-guests.ts`; everything that can
 * be decided without touching the network lives here so it can be tested.
 *
 * Source of the CSV: BigQuery `analytics.bookings` where `is_ota = TRUE`
 * AND ts_confirmed IS NOT NULL AND ts_canceled IS NULL, guest identity resolved
 * from `analytics.int_users` with a fallback to
 * `analytics.report_managed_bookings.guest_name`.
 */
import { FIELD_MAPPING } from "@/server/services/outreach/field-mapping";

/** One guest row as exported from the warehouse. */
export interface OtaGuestRow {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  /** Comma-separated in the CSV, e.g. "airbnb,vrbo". */
  otaChannels: string;
  otaBookings: number;
  firstCheckin: string;
  lastCheckin: string;
  totalBookingValue: number;
  /** Comma-separated property names, capped at 5 by the export query. */
  properties: string;
  /** Comma-separated OTA confirmation codes, capped at 5 by the export query. */
  otaCodes: string;
}

/** A guest after rows for the same email have been merged. */
export interface OtaGuest {
  email: string;
  name: string;
  phone: string | null;
  channels: string[];
  bookings: number;
  firstCheckin: string;
  lastCheckin: string;
  totalBookingValue: number;
  properties: string[];
  otaCodes: string[];
}

export interface SkippedRow {
  row: OtaGuestRow;
  reason: string;
}

const REQUIRED_HEADERS = [
  "guest_name",
  "guest_email",
  "guest_phone",
  "ota_channels",
  "ota_bookings",
  "first_checkin",
  "last_checkin",
  "total_booking_value",
  "properties",
  "ota_codes",
] as const;

/**
 * RFC4180-ish CSV reader: honors quoted fields, escaped quotes ("") and
 * newlines inside quotes, and tolerates CRLF. The warehouse export quotes any
 * field containing a comma (property names and channel lists do).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

function toNumber(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Parse the warehouse export by HEADER NAME, not column position, so a
 * re-ordered or extended export does not silently shift every field.
 */
export function parseOtaGuestCsv(csv: string): OtaGuestRow[] {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (!header) return [];

  const index = new Map(
    header.map((name, i) => [name.trim().toLowerCase(), i]),
  );
  const missing = REQUIRED_HEADERS.filter((name) => !index.has(name));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required column(s): ${missing.join(", ")}. ` +
        `Expected the analytics OTA guest export header: ${REQUIRED_HEADERS.join(",")}`,
    );
  }

  const at = (fields: string[], name: string): string =>
    (fields[index.get(name)!] ?? "").trim();

  return rows.slice(1).map((fields) => ({
    guestName: at(fields, "guest_name"),
    guestEmail: at(fields, "guest_email").toLowerCase(),
    guestPhone: at(fields, "guest_phone"),
    otaChannels: at(fields, "ota_channels"),
    otaBookings: toNumber(at(fields, "ota_bookings")),
    firstCheckin: at(fields, "first_checkin"),
    lastCheckin: at(fields, "last_checkin"),
    totalBookingValue: toNumber(at(fields, "total_booking_value")),
    properties: at(fields, "properties"),
    otaCodes: at(fields, "ota_codes"),
  }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Placeholder guest accounts used by the warehouse for identity-less syncs. */
const PLACEHOLDER_EMAILS = new Set([
  "blocks@wander.com",
  "n/a",
  "none",
  "null",
]);

/**
 * Airbnb/Booking.com write `deleted@gdpr.com` (and similar) into the guest
 * record once a guest exercises their right to erasure. Every erased guest in
 * the export therefore shares one address, so without this skip they collapse
 * into a single composite prospect stitched from several different people —
 * and it would push erased data subjects straight back into a CRM.
 */
const ERASURE_DOMAINS = ["gdpr.com", "privacy.airbnb.com"];

/**
 * OTA staff and contractor addresses. A guest booking on a corporate address is
 * an OTA employee; sending them a "win the next stay direct" play is a partner
 * relationship risk, not a lead.
 */
const OTA_CORPORATE_DOMAINS = [
  "airbnb.com",
  "vrbo.com",
  "booking.com",
  "expedia.com",
  "homeaway.com",
];

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

/**
 * Rows we must never push to Outreach: no real contact, internal staff, the
 * `wander_blocks` placeholder Airbnb reservations sync under, guests who have
 * already been erased, or OTA staff.
 */
export function skipReason(row: OtaGuestRow): string | null {
  const email = row.guestEmail;
  if (!email) return "no email";
  if (PLACEHOLDER_EMAILS.has(email)) return "placeholder guest account";
  if (!EMAIL_RE.test(email)) return "malformed email";
  if (email.endsWith("@wander.com")) return "internal employee";
  if (email.endsWith("@example.com") || email.endsWith("@test.com")) {
    return "test address";
  }
  const domain = domainOf(email);
  if (ERASURE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "GDPR-erased guest";
  }
  if (
    OTA_CORPORATE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  ) {
    return "OTA staff address";
  }
  return null;
}

/**
 * Apple "Hide My Email" relays are scoped to the sender that minted them (the
 * OTA), so mail from Wander is rejected rather than forwarded. Import them —
 * they may have a usable phone — but tag them so the campaign can hold them out
 * of the email step instead of eating the bounces.
 */
export function isRelayEmail(email: string): boolean {
  return domainOf(email) === "privaterelay.appleid.com";
}

/** Tag applied to guests whose only address is a non-deliverable OTA relay. */
export const RELAY_EMAIL_TAG = "OTA Relay Email";

/**
 * Unicode bidi/format controls. iOS wraps a copied phone number in
 * LRE…PDF (U+202A…U+202C), which survives the warehouse export invisibly and
 * would otherwise fail the digit check and silently drop a usable number.
 */
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Strip formatting; keep a leading + so Outreach stores E.164 cleanly. */
export function cleanPhone(phone: string): string | null {
  if (!phone) return null;
  const trimmed = phone.replace(INVISIBLE_RE, "").trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return null;
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned) ? cleaned : null;
}

function maxDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Collapse the export to one entry per email. The warehouse groups by
 * (name, email, phone), so the same guest can appear twice with a formatting
 * difference; Outreach is keyed on email, so merge before writing.
 */
export function dedupeByEmail(rows: OtaGuestRow[]): {
  guests: OtaGuest[];
  skipped: SkippedRow[];
} {
  const skipped: SkippedRow[] = [];
  const byEmail = new Map<string, OtaGuest>();

  for (const row of rows) {
    const reason = skipReason(row);
    if (reason) {
      skipped.push({ row, reason });
      continue;
    }

    const existing = byEmail.get(row.guestEmail);
    const incoming: OtaGuest = {
      email: row.guestEmail,
      name: row.guestName === "N/A" ? "" : row.guestName,
      phone: cleanPhone(row.guestPhone),
      channels: splitList(row.otaChannels),
      bookings: row.otaBookings || 1,
      firstCheckin: row.firstCheckin,
      lastCheckin: row.lastCheckin,
      totalBookingValue: row.totalBookingValue,
      properties: splitList(row.properties),
      otaCodes: splitList(row.otaCodes),
    };

    if (!existing) {
      byEmail.set(row.guestEmail, incoming);
      continue;
    }

    byEmail.set(row.guestEmail, {
      email: existing.email,
      name: existing.name || incoming.name,
      phone: existing.phone ?? incoming.phone,
      channels: Array.from(
        new Set([...existing.channels, ...incoming.channels]),
      ).sort(),
      bookings: existing.bookings + incoming.bookings,
      firstCheckin: minDate(existing.firstCheckin, incoming.firstCheckin),
      lastCheckin: maxDate(existing.lastCheckin, incoming.lastCheckin),
      totalBookingValue:
        existing.totalBookingValue + incoming.totalBookingValue,
      properties: Array.from(
        new Set([...existing.properties, ...incoming.properties]),
      ),
      otaCodes: Array.from(
        new Set([...existing.otaCodes, ...incoming.otaCodes]),
      ),
    });
  }

  return { guests: Array.from(byEmail.values()), skipped };
}

/**
 * A guest whose latest confirmed stay is still ahead of them has a live OTA
 * booking. Pitching them "win the next stay direct" is an off-platform
 * diversion of a booking the OTA has not yet been paid for — squarely against
 * Airbnb/Vrbo partner terms — so the campaign should wait until they check out.
 */
export function hasUpcomingStay(guest: OtaGuest, today: string): boolean {
  return !!guest.lastCheckin && guest.lastCheckin > today;
}

export function splitName(fullName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const [first, ...rest] = parts;
  return { firstName: first ?? null, lastName: rest.join(" ") || null };
}

const CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "Vrbo",
  booking: "Booking.com",
  mybookingpal: "MyBookingPal",
  other: "Other OTA",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel.toLowerCase()] ?? channel;
}

/** Baseline tag applied to every guest in this cohort, alongside the campaign tag. */
export const OTA_GUEST_TAG = "OTA Guest";

export function buildTags(
  guest: OtaGuest,
  campaignTag: string,
  options: { existingTags?: string[]; channelTags?: boolean } = {},
): string[] {
  const tags = new Set(options.existingTags ?? []);
  tags.add(campaignTag);
  tags.add(OTA_GUEST_TAG);
  if (isRelayEmail(guest.email)) tags.add(RELAY_EMAIL_TAG);
  if (options.channelTags) {
    for (const channel of guest.channels) {
      tags.add(`OTA-${channelLabel(channel)}`);
    }
  }
  return Array.from(tags);
}

/** Human-readable context a BDR sees on the prospect record. */
export function buildNote(guest: OtaGuest): string {
  const channels = guest.channels.map(channelLabel).join(" + ") || "OTA";
  const value = Math.round(guest.totalBookingValue).toLocaleString("en-US");
  const properties = guest.properties.join(", ");
  const codes = guest.otaCodes.join(", ");
  return (
    `Past OTA booker: ${guest.bookings} confirmed stay(s) via ${channels} in a Wander home ` +
    `(${guest.firstCheckin} → ${guest.lastCheckin}, $${value} booking value). ` +
    `Property(s): ${properties || "n/a"}. OTA confirmation code(s): ${codes || "n/a"}. ` +
    `Never booked through wander.com direct — win the next stay direct.`
  );
}

/**
 * Custom fields written on NEW prospects only. Existing prospects already carry
 * enrichment from the realtime sync pipeline and we must not clobber it with a
 * partial OTA-only view (e.g. custom24 total spend counts direct bookings too).
 */
export function buildCustomFields(
  guest: OtaGuest,
  campaignTag: string,
): Record<string, string> {
  const fields: Record<string, string> = {
    [FIELD_MAPPING.number_of_bookings]: String(guest.bookings),
    [FIELD_MAPPING.total_money_spent]: String(
      Math.round(guest.totalBookingValue),
    ),
    [FIELD_MAPPING.last_sync_tag]: campaignTag,
  };
  const lastProperty = guest.properties[guest.properties.length - 1];
  if (lastProperty) {
    fields[FIELD_MAPPING.last_property_booked] = lastProperty;
    fields[FIELD_MAPPING.last_5_booked_properties] = guest.properties
      .slice(0, 5)
      .join(", ");
  }
  if (guest.lastCheckin) {
    fields[FIELD_MAPPING.last_booking_transaction_date] = guest.lastCheckin;
  }
  return fields;
}
