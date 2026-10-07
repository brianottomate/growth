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

/** Qualification is a business rule, independent of model interpretation. */
export function isQualified(units: number | null): boolean {
  return units !== null && units >= QUALIFIED_MIN_UNITS;
}

const MEETING_LINK_FORM =
  /\bmeeting\s+link\b|\bbook\s+(a\s+)?(meeting|call)\b/i;

/**
 * Forms that end on a RevenueHero meeting link, by name: "meeting link",
 * "book a meeting", "book a call", "book meeting" or "book call". The lead
 * books a call with a specific rep after submitting, so routing waits for that
 * booking and hands the lead to that rep instead of the round robin.
 */
export function isMeetingLinkForm(
  formName: string | null | undefined,
): boolean {
  return MEETING_LINK_FORM.test(formName ?? "");
}

/**
 * How long after the submit a meeting-link lead waits for its booking before
 * it falls back to the round robin. Booking takes a couple of minutes on the
 * thank-you page; a lead that hasn't booked by then most likely won't.
 */
export const MEETING_LOOKUP_WINDOW_MS = 5 * 60_000;

export function shouldWaitForMeeting({
  leadCreatedAt,
  now = new Date(),
}: {
  leadCreatedAt: Date;
  now?: Date;
}): boolean {
  return now.getTime() - leadCreatedAt.getTime() < MEETING_LOOKUP_WINDOW_MS;
}
