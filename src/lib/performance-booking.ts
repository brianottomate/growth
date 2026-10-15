import { z } from "zod";

// The Amplitude project is a transport boundary. Booking identity belongs to Wander.
export const SITES_AMPLITUDE_PROJECT_ID = 767045;
const id = z.string().trim().min(1).max(256);
const eventTime = z
  .string()
  .transform((value) =>
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value,
  )
  .pipe(z.iso.datetime({ offset: true }));
const envelope = z.object({
  data_type: z.literal("event"),
  app: z.coerce.number().int(),
  event_type: z.string(),
  event_time: eventTime,
  event_properties: z.record(z.string(), z.unknown()),
  user_properties: z.record(z.string(), z.unknown()).default({}),
});
const orderProperties = z.object({
  event_source: z.literal("server"),
  environment: z.literal("production"),
  website_id: id,
  order_id: id,
  product_id: id,
  currency: z.string().regex(/^[A-Z]{3}$/),
  total: z.number().finite().nonnegative().max(99999999999999.99),
  revenue: z
    .number()
    .finite()
    .min(-99999999999999.99)
    .max(99999999999999.99)
    .optional(),
  checkin_date: z.iso.date().optional(),
  checkout_date: z.iso.date().optional(),
});
const attributionKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "campaign_id",
  "meta_campaign_id",
  "ad_id",
  "message_send_id",
  "referrer",
  "referring_domain",
];
export type AttributionScope = "event" | "current" | "last" | "initial";
export type BookingAttribution = Record<
  AttributionScope,
  Record<string, string>
>;
export type BookingEvidence = {
  scope: AttributionScope;
  channel: "meta" | "email" | "chatgpt";
  kind: "signal" | "campaign_name" | "campaign_id" | "message_id";
  matchedId?: string;
};
export type AttributionResult = {
  confidence: "possible" | "confirmed";
  evidence: BookingEvidence[];
};
function pick(input: Record<string, unknown>, prefix = "") {
  const out: Record<string, string> = {};
  for (const key of attributionKeys) {
    const value = input[`${prefix}${key}`];
    if (typeof value === "string" && value.trim() && value.length <= 2000)
      out[key] = value.trim();
  }
  return out;
}
function isChatGptReferral(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["chatgpt.com", "www.chatgpt.com", "chat.openai.com"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export function attributionSignals(
  attribution: BookingAttribution,
): BookingEvidence[] {
  return (
    Object.entries(attribution) as [AttributionScope, Record<string, string>][]
  ).flatMap(([scope, props]) => {
    const evidence: BookingEvidence[] = [];
    const source = props.utm_source?.toLowerCase();
    const medium = props.utm_medium?.toLowerCase();
    if (
      props.fbclid ||
      props.meta_campaign_id ||
      ["facebook", "instagram", "meta", "fb", "ig"].includes(source ?? "")
    )
      evidence.push({ scope, channel: "meta", kind: "signal" });
    if (
      medium === "email" ||
      ["newsletter", "email", "customerio", "postmark"].includes(
        source ?? "",
      ) ||
      props.message_send_id
    )
      evidence.push({ scope, channel: "email", kind: "signal" });
    if (
      source === "chatgpt" ||
      isChatGptReferral(source) ||
      isChatGptReferral(props.referrer) ||
      isChatGptReferral(props.referring_domain)
    )
      evidence.push({ scope, channel: "chatgpt", kind: "signal" });
    return evidence;
  });
}
export function parseSitesOrder(raw: unknown) {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return { status: "invalid_payload" } as const;
  const input = parsed.data;
  if (input.app !== SITES_AMPLITUDE_PROJECT_ID)
    return { status: "wrong_project" } as const;
  if (input.event_type !== "Order Completed")
    return { status: "ignored_event" } as const;
  const props = orderProperties.safeParse(input.event_properties);
  if (!props.success) return { status: "invalid_order" } as const;
  const attribution: BookingAttribution = {
    event: pick(input.event_properties),
    current: pick(input.user_properties),
    last: pick(input.user_properties, "last_"),
    initial: pick(input.user_properties, "initial_"),
  };
  return {
    status: "valid",
    booking: {
      bookingId: props.data.order_id,
      websiteId: props.data.website_id,
      propertyId: props.data.product_id,
      confirmedAt: new Date(input.event_time),
      currency: props.data.currency,
      total: props.data.total,
      revenue: props.data.revenue ?? null,
      checkIn: props.data.checkin_date ?? null,
      checkOut: props.data.checkout_date ?? null,
      attribution,
    },
  } as const;
}
export type SitesOrder = Extract<
  ReturnType<typeof parseSitesOrder>,
  { status: "valid" }
>["booking"];
export type ManagedCampaign = {
  id: string;
  externalId: string | null;
  name: string;
};
export type SentMessage = {
  id: string;
  providerBroadcastId: string;
  sentAt: Date;
};

// A matched campaign identifies a touch, not incremental causation or last-click credit.
// Initial acquisition stays possible: it does not establish this booking's campaign.
export function classifyBookingAttribution(
  attribution: BookingAttribution,
  campaigns: ManagedCampaign[],
  messages: SentMessage[],
  confirmedAt: Date,
): AttributionResult {
  const evidence = attributionSignals(attribution);
  let confidence: AttributionResult["confidence"] = "possible";
  for (const [scope, props] of Object.entries(attribution) as [
    AttributionScope,
    Record<string, string>,
  ][]) {
    const campaignIds = [
      props.utm_id,
      props.campaign_id,
      props.meta_campaign_id,
    ].filter(Boolean);
    const exactCampaigns = campaigns.filter(
      (c) =>
        campaignIds.includes(c.id) ||
        (c.externalId && campaignIds.includes(c.externalId)),
    );
    if (exactCampaigns.length === 1) {
      evidence.push({
        scope,
        channel: "meta",
        kind: "campaign_id",
        matchedId: exactCampaigns[0]!.id,
      });
      if (scope !== "initial") confidence = "confirmed";
    } else {
      const named = campaigns.filter((c) => c.name === props.utm_campaign);
      if (named.length === 1)
        evidence.push({
          scope,
          channel: "meta",
          kind: "campaign_name",
          matchedId: named[0]!.id,
        });
    }
    // IDs must refer to an actual send for this customer's brand, before the booking.
    const exactMessages = messages.filter(
      (m) =>
        m.sentAt <= confirmedAt &&
        [props.utm_id, props.message_send_id].includes(m.id),
    );
    if (exactMessages.length === 1) {
      evidence.push({
        scope,
        channel: "email",
        kind: "message_id",
        matchedId: exactMessages[0]!.id,
      });
      if (scope !== "initial") confidence = "confirmed";
    }
  }
  return { confidence, evidence };
}
