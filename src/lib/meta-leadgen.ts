import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/** 10+ units is "qualified" (Kristian, 2026-09-22). 0 and 1-10 never qualify. */
export const QUALIFIED_MIN_UNITS = 10;

/**
 * CRM event name sent to the Wander pixel. It matches the funnel stage HubSpot
 * created on dataset 340252052212435, so the Meta funnel config and the ad set
 * conversion event ("Marketing Qualified Lead") stay the same after cutover.
 */
export const QUALIFIED_LEAD_EVENT = "Marketing Qualified Lead";

const leadFieldDataSchema = z.array(
  z.object({ name: z.string(), values: z.array(z.string()).default([]) }),
);
export type LeadFieldData = z.infer<typeof leadFieldDataSchema>;

/** A lead as the Graph API returns it for `LEAD_FIELDS`. */
export const metaLeadSchema = z.object({
  id: z.string().regex(/^\d+$/),
  created_time: z.string(),
  form_id: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  adset_name: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  is_organic: z.boolean().optional(),
  field_data: leadFieldDataSchema,
});
export type MetaLead = z.infer<typeof metaLeadSchema>;

/** Validate a Graph lead; shape drift fails the lead loudly instead of misqualifying it. */
export function parseMetaLead(json: unknown): MetaLead {
  const parsed = metaLeadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `[meta-leadgen] unexpected lead shape: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

const leadgenChangeSchema = z.object({
  field: z.literal("leadgen"),
  value: z.object({
    leadgen_id: z.coerce.string(),
    page_id: z.coerce.string(),
    form_id: z.coerce.string().optional(),
    ad_id: z.coerce.string().optional(),
    adgroup_id: z.coerce.string().optional(),
    created_time: z.number().optional(),
  }),
});

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({ changes: z.array(z.unknown()).default([]) }).passthrough(),
  ),
});

export type LeadgenNotification = z.infer<typeof leadgenChangeSchema>["value"];

/**
 * Page webhook payload → leadgen notifications. `dropped` counts changes that
 * didn't parse as leadgen, so shape drift shows up in the logs.
 */
export function parseLeadgenWebhook(rawBody: string): {
  notifications: LeadgenNotification[];
  dropped: number;
} {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { notifications: [], dropped: 1 };
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success || parsed.data.object !== "page") {
    return { notifications: [], dropped: 1 };
  }
  const notifications: LeadgenNotification[] = [];
  let dropped = 0;
  for (const change of parsed.data.entry.flatMap((e) => e.changes)) {
    const lead = leadgenChangeSchema.safeParse(change);
    if (lead.success) notifications.push(lead.data.value);
    else dropped += 1;
  }
  return { notifications, dropped };
}

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  const hex = header?.startsWith("sha256=") ? header.slice(7) : null;
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) return false;
  const received = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function answer(fields: LeadFieldData, match: (name: string) => boolean) {
  const value = fields.find((f) => match(f.name.toLowerCase()))?.values[0];
  return value?.trim() || null;
}

const UNIT_QUESTION =
  /how_many|number_of_properties|n[uú]mero_de_propiedades|15\+|more_than_5/;

const UPPER_BOUND =
  /<|\b(less|fewer)\s+than\b|\bunder\b|\bup\s+to\b|\bmenos\s+de\b|\bhasta\b/;

/**
 * Unit count from any active Wander lead form. Forms ask it as buckets
 * ("10-199"), free text ("6-20", "12 homes") or a Yes/No gate. A range counts
 * by its low end so "1-10" stays unqualified, and an upper bound ("<10",
 * "less than 10") is a range from 0. Yes/No answers carry no count.
 */
export function parseUnitCount(fields: LeadFieldData): number | null {
  let best: number | null = null;
  for (const field of fields) {
    if (!UNIT_QUESTION.test(field.name.toLowerCase())) continue;
    const raw = (field.values[0] ?? "").toLowerCase().replaceAll(",", "");
    if (/^(yes|no|si|sí)$/.test(raw.trim())) continue;
    const first = /\d+/.exec(raw)?.[0];
    if (!first) continue;
    if (Number(first) >= 100_000) continue;
    const units = UPPER_BOUND.test(raw) ? 0 : Number(first);
    best = best === null ? units : Math.max(best, units);
  }
  return best;
}

/**
 * WanderOS operator forms all ask the unit question; the Page's marketplace
 * guest waitlist forms don't, and those leads must never reach HubSpot.
 */
export function isOperatorLead(fields: LeadFieldData): boolean {
  return fields.some((f) => UNIT_QUESTION.test(f.name.toLowerCase()));
}

export function isQualified(units: number | null): boolean {
  return units !== null && units >= QUALIFIED_MIN_UNITS;
}

const NOT_A_BOOKING_SITE =
  /airbnb\.|vrbo\.|facebook\.com|instagram\.com|sites\.google\.com/i;

/**
 * The booking-site answer, or null when it isn't one. Most answers are an
 * Airbnb/VRBO/social link or a sentence, and the router looks up the HubSpot
 * company by this domain (Make dropped the same answers).
 */
function bookingSite(raw: string | null): string | null {
  if (!raw || /[\s@]/.test(raw) || !raw.includes(".")) return null;
  return NOT_A_BOOKING_SITE.test(raw) ? null : raw;
}

/** The contact fields the inbound router needs, pulled from Meta's field names. */
export function leadContact(fields: LeadFieldData) {
  const fullName = answer(fields, (n) => n === "full_name");
  const [first, ...rest] = fullName?.split(/\s+/) ?? [];
  return {
    email:
      answer(
        fields,
        (n) => n === "email" || n === "work_email",
      )?.toLowerCase() ?? null,
    firstName: answer(fields, (n) => n === "first_name") ?? first ?? null,
    lastName:
      answer(fields, (n) => n === "last_name") ??
      (rest.length ? rest.join(" ") : null),
    phone: answer(
      fields,
      (n) => n === "phone_number" || n === "work_phone_number",
    ),
    siteUrl: bookingSite(
      answer(
        fields,
        (n) => n.includes("direct_booking") || n.startsWith("comparte_el_link"),
      ),
    ),
    pms: answer(fields, (n) => n.includes("pms")),
  };
}
