import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  leadChannelTable,
  leadDomainTable,
  type ContactFormField,
  type LeadChannelKind,
} from "@/server/db/leads-schema";
import {
  isFirecrawlConfigured,
  mapWebsite,
  scrapeStructured,
} from "@/server/clients/firecrawl.client";
import {
  buildResolvedChannel,
  resolveContactChannel,
  type ResolvedContactChannel,
} from "@/server/services/lead-channel.service";

/**
 * Contact-channel discovery — crawl a lead's OWN website to capture every way
 * to reach them (emails, phones, a contact form, a live-chat widget). Always-on
 * enrichment: it has no dependency on lead scoring. The output is persisted as
 * `lead_channel` rows (the queryable projection) plus a cache blob on
 * `lead_domain.enrichment.contactChannels`; the email side is also folded into a
 * back-compat `ResolvedContactChannel` so the existing `scoreLeadChannel` keeps
 * working.
 *
 * Engine: Firecrawl `map` (find the contact page) → `scrape` with the v2 `json`
 * format (structured extraction) + raw HTML (chat-widget signature sniff) in one
 * call. Falls back to the naive `resolveContactChannel` fetch+regex when
 * Firecrawl is unconfigured or returns nothing.
 */

// One discovered channel, pre-persistence. The router upserts these into
// `lead_channel` (kind+value is the dedup key).
export type DiscoveredChannel = {
  kind: LeadChannelKind;
  value: string;
  fields?: ContactFormField[];
  vendor?: string | null;
  source: "firecrawl_extract" | "regex";
  confidence?: number | null;
};

export type ChannelDiscoveryResult = {
  domain: string;
  via: "firecrawl" | "regex";
  scrapedAt: string;
  channels: DiscoveredChannel[];
  // Back-compat projection consumed by `scoreLeadChannel` and the send-review UI.
  contactChannel: ResolvedContactChannel;
};

// The schema the Firecrawl `json` format extracts against. Kept deliberately
// flat — the model fills what it can find on the page.
const ContactChannelsSchema = z.object({
  emails: z
    .array(
      z.object({
        value: z.string().describe("A contact email address found on the page"),
        kind: z
          .enum(["role", "corporate", "freemail"])
          .nullable()
          .describe("role inbox (info@/contact@), corporate, or freemail"),
      }),
    )
    .describe("All contact email addresses on the page (empty if none)"),
  phones: z
    .array(
      z.object({
        value: z.string().describe("A phone number, as written on the page"),
        label: z
          .string()
          .nullable()
          .describe("Any label, e.g. 'reservations', 'office'"),
      }),
    )
    .describe("All phone numbers on the page (empty if none)"),
  contactForm: z
    .object({
      url: z.string().describe("The URL of the page hosting the contact form"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("The form field name/identifier"),
            label: z.string().nullable().describe("The visible field label"),
            type: z
              .string()
              .nullable()
              .describe("Input type: text, email, tel, textarea, select…"),
            required: z.boolean().nullable().describe("Whether it's required"),
          }),
        )
        .describe("The fields the form asks for"),
    })
    .nullable()
    .describe("The contact form if the page has one, else null"),
  chatbot: z
    .object({
      present: z
        .boolean()
        .describe("Whether a live-chat / chatbot widget is on the page"),
      vendor: z
        .string()
        .nullable()
        .describe("The chat vendor if identifiable (Intercom, Drift, …)"),
    })
    .describe("Live-chat / chatbot presence"),
});

type ContactChannels = z.infer<typeof ContactChannelsSchema>;

const EXTRACT_PROMPT =
  "Find every way to contact this company from this page: contact email " +
  "addresses, phone numbers, a contact/enquiry form (with its fields), and " +
  "whether a live-chat or chatbot widget is present. Only report details " +
  "actually on the page; do not invent any.";

// Contact-page path preferences, richest first (mirrors resolveContactChannel).
const CONTACT_PATH_RE =
  /\/(contact|contact-us|contactus|get-in-touch|enquir|inquir|reach|support|about|about-us)\b/i;

// Known chat-widget script signatures → vendor. The `present` flag from the
// model is load-bearing; vendor is a best-effort HTML sniff (lazy-loaded
// widgets frequently don't survive Firecrawl's pre-render).
const CHAT_VENDOR_SIGNATURES: Array<{ vendor: string; re: RegExp }> = [
  { vendor: "intercom", re: /widget\.intercom\.io|intercomcdn|intercomSettings/i },
  { vendor: "drift", re: /js\.driftt\.com|drift\.com\/|driftt\.com/i },
  { vendor: "crisp", re: /client\.crisp\.chat|crisp\.chat/i },
  { vendor: "tidio", re: /code\.tidio\.co|tidio\.com/i },
  { vendor: "tawk", re: /embed\.tawk\.to|tawk\.to/i },
  { vendor: "zendesk", re: /static\.zdassets\.com|zopim|zendesk/i },
  { vendor: "hubspot", re: /js\.hs-scripts\.com|hubspotchat|usemessages\.com/i },
  { vendor: "livechat", re: /cdn\.livechatinc\.com|livechatinc/i },
  { vendor: "facebook", re: /connect\.facebook\.net\/.+\/sdk\/xfbml\.customerchat/i },
];

function detectChatVendorFromHtml(html: string | undefined): string | null {
  if (!html) return null;
  for (const { vendor, re } of CHAT_VENDOR_SIGNATURES) {
    if (re.test(html)) return vendor;
  }
  return null;
}

/** Pick the best single contact page from a site map (richest path wins). */
function pickContactUrl(links: string[], domain: string): string {
  const contactLinks = links.filter((l) => CONTACT_PATH_RE.test(l));
  return contactLinks[0] ?? links[0] ?? `https://${domain}/contact`;
}

/** Normalize a phone string to digits-and-plus for dedup/storage. */
function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  // Drop obvious non-numbers (years, single tokens). Phone numbers are 7-15 digits.
  if (digits.length < 7 || digits.length > 15) return null;
  return cleaned.startsWith("+") ? cleaned : digits;
}

/** Map the Firecrawl extraction into our channel rows + back-compat projection. */
function toResult(
  domain: string,
  companyName: string | null,
  extracted: ContactChannels,
  html: string | undefined,
): ChannelDiscoveryResult {
  const channels: DiscoveredChannel[] = [];
  const emails: string[] = [];

  for (const e of extracted.emails ?? []) {
    const value = e.value?.trim().toLowerCase();
    if (!value?.includes("@")) continue;
    emails.push(value);
    channels.push({
      kind: "email",
      value,
      source: "firecrawl_extract",
    });
  }

  const seenPhones = new Set<string>();
  for (const p of extracted.phones ?? []) {
    const value = normalizePhone(p.value ?? "");
    if (!value || seenPhones.has(value)) continue;
    seenPhones.add(value);
    channels.push({
      kind: "phone",
      value,
      vendor: p.label ?? null,
      source: "firecrawl_extract",
    });
  }

  if (extracted.contactForm?.url) {
    channels.push({
      kind: "form",
      value: extracted.contactForm.url,
      fields: (extracted.contactForm.fields ?? []).map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
      })),
      source: "firecrawl_extract",
    });
  }

  if (extracted.chatbot?.present) {
    const vendor =
      extracted.chatbot.vendor ?? detectChatVendorFromHtml(html) ?? null;
    channels.push({
      kind: "chatbot",
      value: `https://${domain}`,
      vendor,
      source: "firecrawl_extract",
    });
  }

  return {
    domain,
    via: "firecrawl",
    scrapedAt: new Date().toISOString(),
    channels,
    contactChannel: buildResolvedChannel({
      domain,
      companyName,
      emails,
      hasForm: !!extracted.contactForm,
    }),
  };
}

/** Project a naive `ResolvedContactChannel` (fetch+regex fallback) into channels. */
function fromResolved(resolved: ResolvedContactChannel): ChannelDiscoveryResult {
  const channels: DiscoveredChannel[] = resolved.emails.map((value) => ({
    kind: "email" as const,
    value,
    source: "regex" as const,
  }));
  if (resolved.hasForm && resolved.route === "form") {
    channels.push({
      kind: "form",
      value: `https://${resolved.domain}/contact`,
      source: "regex",
    });
  }
  return {
    domain: resolved.domain,
    via: "regex",
    scrapedAt: resolved.scrapedAt ?? new Date().toISOString(),
    channels,
    contactChannel: resolved,
  };
}

/**
 * Discover all contact channels for a domain. Firecrawl-first, with the naive
 * scraper as a zero-cost fallback. Never throws — returns the regex fallback on
 * any Firecrawl failure so the caller always gets a usable result.
 */
export async function discoverContactChannels(input: {
  domain: string;
  companyName?: string | null;
}): Promise<ChannelDiscoveryResult> {
  const domain = input.domain.toLowerCase();
  const companyName = input.companyName ?? null;

  if (!isFirecrawlConfigured) {
    return fromResolved(await resolveContactChannel({ domain, companyName }));
  }

  // 1. Find the best contact page (sitemap-aware), then 2. structured-scrape it.
  const map = await mapWebsite({
    url: `https://${domain}`,
    search: "contact",
    limit: 25,
  });
  const contactUrl = pickContactUrl(map?.links ?? [], domain);

  const scraped = await scrapeStructured({
    url: contactUrl,
    schema: ContactChannelsSchema,
    prompt: EXTRACT_PROMPT,
    includeHtml: true,
  });

  // Firecrawl unreachable / nothing extracted → fall back to the naive scraper.
  if (!scraped?.json) {
    return fromResolved(await resolveContactChannel({ domain, companyName }));
  }

  return toResult(domain, companyName, scraped.json, scraped.html);
}

/**
 * Discover + persist in one shot: caches the capture on
 * `lead_domain.enrichment.contactChannels`, promotes the `hasPhone/hasForm/
 * hasChatbot` flags, and upserts `lead_channel` rows (refreshing capture fields
 * while preserving any delivery state already on a row). Shared by the
 * `resolveChannel` mutation and the backfill cron so persistence lives once.
 */
export async function captureAndPersistChannels(input: {
  domainId: string;
  domain: string;
  companyName?: string | null;
}): Promise<ChannelDiscoveryResult> {
  const discovery = await discoverContactChannels({
    domain: input.domain,
    companyName: input.companyName,
  });
  const { contactChannel, channels } = discovery;

  await db
    .update(leadDomainTable)
    .set({
      enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify(
        {
          contactChannel,
          contactChannels: {
            via: discovery.via,
            scrapedAt: discovery.scrapedAt,
            channels,
          },
        },
      )}::jsonb`,
      hasPhone: channels.some((c) => c.kind === "phone"),
      hasForm: channels.some((c) => c.kind === "form"),
      hasChatbot: channels.some((c) => c.kind === "chatbot"),
    })
    .where(eq(leadDomainTable.id, input.domainId));

  if (channels.length) {
    await db
      .insert(leadChannelTable)
      .values(
        channels.map((c) => ({
          domainId: input.domainId,
          domain: input.domain,
          kind: c.kind,
          value: c.value,
          fields: c.fields ?? null,
          vendor: c.vendor ?? null,
          source: c.source,
          confidence: c.confidence ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          leadChannelTable.domainId,
          leadChannelTable.kind,
          leadChannelTable.value,
        ],
        set: {
          fields: sql`excluded.fields`,
          vendor: sql`excluded.vendor`,
          source: sql`excluded.source`,
          confidence: sql`excluded.confidence`,
          updatedAt: new Date(),
        },
      });
  }

  return discovery;
}

export type ChannelBackfillResult = {
  candidateCount: number;
  ok: number;
  failed: number;
  errors: Array<{ domain: string; error: string }>;
};

/**
 * Backfill channel discovery across the lead universe. Skip-if-fresh: only
 * domains never scraped, or whose cached `scrapedAt` is older than `staleDays`,
 * are candidates (Firecrawl calls are paid). Best leads first. Bounded
 * worker-pool concurrency, mirroring `growth-workflows.service.ts`.
 */
export async function backfillContactChannels(
  opts: { limit?: number; concurrency?: number; staleDays?: number } = {},
): Promise<ChannelBackfillResult> {
  const limit = opts.limit ?? 100;
  const staleDays = opts.staleDays ?? 30;

  const candidates = await db
    .select({
      id: leadDomainTable.id,
      domain: leadDomainTable.domain,
      companyName: leadDomainTable.companyName,
    })
    .from(leadDomainTable)
    .where(
      and(
        isNull(leadDomainTable.deletedAt),
        eq(leadDomainTable.excludeFromOutreach, false),
        or(
          sql`${leadDomainTable.enrichment} -> 'contactChannels' ->> 'scrapedAt' is null`,
          sql`(${leadDomainTable.enrichment} -> 'contactChannels' ->> 'scrapedAt')::timestamptz < now() - make_interval(days => ${staleDays})`,
        ),
      ),
    )
    .orderBy(sql`${leadDomainTable.scorePregenPotential} desc nulls last`)
    .limit(limit);

  const concurrency = Math.max(
    1,
    Math.min(opts.concurrency ?? 4, 10, candidates.length || 1),
  );

  let index = 0;
  let ok = 0;
  let failed = 0;
  const errors: Array<{ domain: string; error: string }> = [];

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= candidates.length) return;
      const candidate = candidates[current]!;
      try {
        await captureAndPersistChannels({
          domainId: candidate.id,
          domain: candidate.domain,
          companyName: candidate.companyName,
        });
        ok += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 20) {
          errors.push({
            domain: candidate.domain,
            error: e instanceof Error ? e.message : "unknown",
          });
        }
      }
    }
  });

  await Promise.all(workers);

  return { candidateCount: candidates.length, ok, failed, errors };
}
