import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { leadDomainTable, leadContactTable } from "@/server/db/leads-schema";

/**
 * Personalized cold-outreach generation — the payoff of all the enrichment.
 *
 * At our low volume, generic templated cold email wastes the per-company
 * knowledge we collected. This takes everything we know about ONE lead (their
 * site, market, size, PMS, current-site weaknesses) + the WanderOS hook strategy
 * and writes a bespoke 4-touch sequence for that specific company.
 *
 * Output is a DRAFT for human review — stored on leads.domain.enrichment
 * (outreachDraft). The lifecycle programs stay the strategic "recipe"; this is
 * the per-lead "meal" and lives in the leads domain (high cardinality belongs here).
 *
 * House rule: generateText + Output.object (never generateObject).
 */

const MODEL = "claude-sonnet-4-5";

export const OutreachDraftSchema = z.object({
  angle: z
    .string()
    .describe("The single sharpest hook chosen FOR THIS company, and one line on why"),
  personalizedOn: z
    .array(z.string())
    .describe("The concrete, specific facts about this company you used (so a human can sanity-check the personalization isn't generic/hallucinated)"),
  steps: z
    .array(
      z.object({
        subject: z
          .string()
          .nullable()
          .describe("Subject line for step 1; null for follow-ups (they reply in-thread)"),
        body: z.string().describe("Plain-text body, ending with the sign-off 'Emily' on its own line"),
        delayDays: z.number().int().describe("Days to wait before sending THIS step (0 for the first)"),
      }),
    )
    .describe("A 4-step cold sequence: hook → value → proof → low-friction breakup"),
});
export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;

const STRATEGY = `You write cold outbound for WanderOS — Wander's platform for vacation-rental property managers. The offer:
- A conversion-optimized DIRECT-BOOKING website (own your bookings; pay the OTAs ~15-18% less per stay).
- Built to be FOUND in AI search (ChatGPT and other LLMs) and Google — Wander cites that ~37% of trip searches now start on AI. Say "built to show up / rank well in AI search" — NEVER promise a guaranteed #1 ranking.
- Done-for-you: connect their PMS in one click, listings auto-populate, live in 48 hours. No setup/upfront cost, no dev work.
- PRICING (this is CONTEXT for you — do NOT put dollar figures in the email):
  • For your awareness only: it's $19/month hosting + a 3% fee built into the GUEST's nightly rate (not deducted from the PM's payout); no setup/upfront cost; no dev work.
  • DO NOT quote WanderOS's own price — no $19/month, no 3% fee, no dollar amount for the platform — in the cold emails; defer those specifics to the call/audit. (The OTA commission comparison, e.g. "~15-18% to the OTAs", IS fine — that's THEIR cost, the whole point.) At this low volume we deliberately keep our own pricing out of the cold touches.
  • You must STILL never imply it's "free", "$0", or "nothing out of pocket." If you gesture at cost at all, you may note (truthfully) only that there's no upfront/setup cost and no dev work — never a monthly figure, never frame the per-booking fee as a PM cost.
- Proof (Wander's OWN published figures — fine to cite, never invent others): $75M+ booked direct, 10,000+ properties, 1,000+ PMs, 11+ PMS integrations.

Sequence shape (4 touches): (1) hook — lead with the single best angle for THIS company; (2) value/ease; (3) proof/credibility; (4) short, low-friction breakup ("reply 'preview'"). Cadence: day 0, 2, 5, 9.

Cold-email rules:
- SHORT. One idea per email. Plain text, no marketing fluff, no exclamation spam, no glib throwaway lines (e.g. "not just Google from 2019").
- PERSONALIZE on real specifics from the evidence (their market, property types, current site/PMS, size, a weakness). Reference something only someone who looked at THEM would know. Never invent facts or statistics — use ONLY the pricing and proof numbers given above; if unsure, stay general rather than guess.
- Sender is "Emily" (signs off "Emily" only — a formal signature is appended automatically).
- If a decision-maker's first name is provided, you may greet them; otherwise greet the business generally (it may go to a shared inbox).
- CTA: low-friction (reply, or a free audit). When you include the audit link, write it exactly as https://www.wander.com/os — we append UTM tracking automatically afterward, so don't add query parameters yourself.`;

/** Per-lead tracked /os link — utm_content=domain so Amplitude attributes the
 * visit to the exact company. We inject this rather than trusting the model. */
const osLink = (domain: string) =>
  `https://www.wander.com/os?utm_source=cold_email&utm_medium=outbound&utm_campaign=personalized_v1&utm_content=${encodeURIComponent(domain)}`;
const OS_LINK_RE = /(https?:\/\/)?(www\.)?wander\.com\/os\S*/gi;

type ExtractionContext = {
  company?: {
    brandName?: string;
    description?: string;
    serviceAreas?: string[];
  };
  pms?: {
    detected?: string;
  };
  portfolio?: {
    propertyTypes?: string[];
  };
  brand?: {
    voice?: string;
    hasOnlineBooking?: boolean;
  };
  pregenFit?: {
    rationale?: string;
    signals?: string[];
  };
  redFlags?: string[];
};

type LeadEnrichmentContext = {
  extraction?: ExtractionContext;
};

function buildContext(row: typeof leadDomainTable.$inferSelect, contactName: string | null): string {
  const enrichment = (row.enrichment ?? {}) as LeadEnrichmentContext;
  const ex = enrichment.extraction ?? {};
  const lines: string[] = [
    `Domain: ${row.domain}`,
    `Company: ${row.companyName ?? ex?.company?.brandName ?? "(unknown)"}`,
    row.city || row.state || row.country ? `Location: ${[row.city, row.state, row.country].filter(Boolean).join(", ")}` : "",
    `PMS: ${row.pms ?? ex?.pms?.detected ?? "unknown"}`,
    `Managed units (best estimate): ${row.unitEstimate ?? "unknown"}`,
    ex?.company?.description ? `What they do: ${ex.company.description}` : "",
    ex?.company?.serviceAreas?.length ? `Markets: ${ex.company.serviceAreas.join(", ")}` : "",
    ex?.portfolio?.propertyTypes?.length ? `Property types: ${ex.portfolio.propertyTypes.join(", ")}` : "",
    ex?.brand?.voice ? `Brand voice: ${ex.brand.voice}` : "",
    typeof ex?.brand?.hasOnlineBooking === "boolean" ? `Has online booking already: ${ex.brand.hasOnlineBooking}` : "",
    ex?.pregenFit?.rationale ? `Fit rationale: ${ex.pregenFit.rationale}` : "",
    ex?.pregenFit?.signals?.length ? `Signals: ${ex.pregenFit.signals.join("; ")}` : "",
    ex?.redFlags?.length ? `Caveats: ${ex.redFlags.join("; ")}` : "",
    contactName ? `Decision-maker first name: ${contactName}` : "Recipient: likely a shared inbox (no named contact)",
  ];
  return lines.filter(Boolean).join("\n");
}

export type OutreachResult = { domain: string; model: string; draft: OutreachDraft };

export async function generateOutreachDraft(
  domain: string,
  opts: { steer?: string } = {},
): Promise<OutreachResult> {
  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
  });
  if (!row) throw new Error(`lead domain not found: ${domain}`);

  // Best decision-maker first name, if we have a credible one.
  const contacts = await db
    .select({ firstName: leadContactTable.firstName, jobTitle: leadContactTable.jobTitle })
    .from(leadContactTable)
    .where(eq(leadContactTable.domainId, row.id))
    .limit(50);
  const dm = contacts.find(
    (c) => c.firstName && /owner|founder|ceo|president|principal|partner|director|gm|general manager|head/i.test(c.jobTitle ?? ""),
  );

  // Optional operator steer — context injection to override/guide the AI
  // (e.g. "treat this as a 200-unit luxury PM in Aspen", or notes on the person).
  const steerBlock = opts.steer?.trim()
    ? `\n\n=== OPERATOR STEER (authoritative — follow these instructions and treat as context about this prospect, even where it differs from the data above) ===\n${opts.steer.trim()}`
    : "";

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({
      name: "OutreachDraft",
      description: "A bespoke 4-touch cold sequence personalized to this company",
      schema: OutreachDraftSchema,
    }),
    prompt: `${STRATEGY}\n\n=== WHAT WE KNOW ABOUT THIS COMPANY ===\n${buildContext(row, dm?.firstName ?? null)}${steerBlock}\n\nWrite the 4-touch sequence now, personalized to THIS company.`,
  });

  // Inject the per-lead tracked /os link (the model writes the bare URL).
  const draft: OutreachDraft = {
    ...output,
    steps: output.steps.map((s) => ({
      ...s,
      body: s.body.replace(OS_LINK_RE, osLink(domain)),
    })),
  };

  return { domain, model: MODEL, draft };
}
