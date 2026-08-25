import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import {
  extractBearerToken,
  safeTokenEquals,
} from "@/server/utils/webhook-auth";
import type {
  CompanyProperties,
  ContactProperties,
} from "@/server/clients/hubspot.client";

// =====================================================
// HUBSPOT GATEWAY — shared surface for /api/hubspot/v1/*
// =====================================================
//
// The growth repo is Wander's HubSpot gateway (docs/hubspot-gateway-plan.md):
// internal callers (wander.com, the monolith) talk to HubSpot through the
// REST routes under src/app/api/hubspot/v1/, which delegate here. This file
// owns the bearer auth and the request-body vocabulary; the CRM calls live
// in src/server/clients/hubspot.client.ts. Phase 3 adds the inbound-router
// handler alongside.

/**
 * Bearer auth for gateway routes. Returns an error response (500 when the
 * token isn't configured, 401 on mismatch) or null when authorized.
 * Timing-safe comparison via the shared webhook-auth utils.
 */
export function requireGatewayAuth(request: NextRequest): NextResponse | null {
  const configured = env.GROWTH_GATEWAY_API_TOKEN;
  if (!configured) {
    console.error(
      "❌ [hubspot-gateway] GROWTH_GATEWAY_API_TOKEN not configured",
    );
    return NextResponse.json(
      { success: false, error: "Gateway auth is not configured" },
      { status: 500 },
    );
  }
  const presented = extractBearerToken(request.headers.get("authorization"));
  if (!safeTokenEquals(presented, configured)) {
    return NextResponse.json(
      { success: false, error: "Invalid bearer token" },
      { status: 401 },
    );
  }
  return null;
}

// =====================================================
// REQUEST BODIES
// =====================================================
//
// Strict on purpose: the gateway is the one place property names get
// validated, and a silently-stripped typo'd property is worse than a 400.
// The `satisfies z.ZodType<...Properties>` clause compile-links each schema
// to the client's property types so they can't drift. Write schemas exclude
// the upsert key (domain/email) and read-only context (notes_last_contacted).

const companyWriteProps = z.strictObject({
  name: z.string().optional(),
  type: z.literal("Wander Sites").optional(),
  hs_lead_status: z.string().optional(),
  hubspot_owner_id: z.string().optional(),
  inbound_outbound: z.enum(["Inbound", "Inbound - Sites"]).optional(),
  portfolio_size: z.string().optional(),
  pms_ai_identified: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  sites_preview_url: z.string().optional(),
  pm_company_: z.enum(["Yes", "No"]).optional(),
  ww_listing_url: z.string().optional(),
}) satisfies z.ZodType<CompanyProperties>;

export const upsertCompanyBody = z.strictObject({
  domain: z.string().trim().toLowerCase().min(1),
  properties: companyWriteProps.optional().default({}),
});
export type UpsertCompanyBody = z.infer<typeof upsertCompanyBody>;

const contactWriteProps = z.strictObject({
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  jobtitle: z.string().optional(),
  inbound_outbound: z.enum(["Inbound", "Inbound - Sites"]).optional(),
  hs_lead_status: z.string().optional(),
  hubspot_owner_id: z.string().optional(),
  lead_type: z
    .enum([
      "WanderOS Email Signup",
      "Listed Form Submission",
      "Sites Form Submission",
    ])
    .optional(),
  lifecyclestage: z.string().optional(),
  hs_analytics_source: z.string().optional(),
  inbound_date: z.string().optional(),
  meeting_booked_inbound_form: z.enum(["true", "false"]).optional(),
  operated_application: z.enum(["true", "false"]).optional(),
  portfolio_size_inbound_form: z.string().optional(),
  direct_booking_site_inbound_form: z.string().optional(),
  pms_inbound_form: z.string().optional(),
  intent_inbound_form: z.string().optional(),
  portfolio_size_ai_guess_1_exact: z.string().optional(),
  portfolio_size_ai_guess_1_range: z.string().optional(),
  portfolio_size_ai_guess_2_exact: z.string().optional(),
  portfolio_size_ai_guess_2_range: z.string().optional(),
  growth_pregen_preview_url: z.string().url().optional(),
  growth_pregen_touch_1_subject: z.string().optional(),
  growth_pregen_touch_1_body: z.string().optional(),
  growth_pregen_touch_2_subject: z.string().optional(),
  growth_pregen_touch_2_body: z.string().optional(),
  growth_pregen_touch_1_observation: z.string().optional(),
  growth_pregen_touch_2_fit: z.string().optional(),
  growth_pregen_touch_3_subject: z.string().optional(),
}) satisfies z.ZodType<ContactProperties>;

export const upsertContactBody = z.strictObject({
  email: z.email().transform((v) => v.toLowerCase()),
  properties: contactWriteProps.optional().default({}),
});
export type UpsertContactBody = z.infer<typeof upsertContactBody>;

/**
 * Inbound lead router payload — ported from wander.com's `osInboundSchema`
 * (src/features/os/inbound/schema.ts). wander.com validates the raw form with
 * its own copy and forwards the parsed payload wholesale. Deliberately NOT
 * strictObject (unlike the property-write schemas above): unknown keys are
 * stripped, not rejected, so wander.com adding a form field before this schema
 * learns about it degrades to "field ignored" instead of "every lead 400s".
 */
export const inboundBody = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email")),
  directBookingSiteUrl: z.string().trim().min(1).optional(),
  // Required for AE routing by portfolio size (WOS-3677). Pure integer to keep
  // the HubSpot property numerically comparable for routing rules.
  numberOfProperties: z.coerce.number().int().min(0).max(10000),
  source: z.string().trim().min(1).default("unknown"),

  // For leads that come from Meta forms.
  // No length cap here: a too-long value must not fail validation and drop the
  // whole lead — mapPmsToHsValues bounds the model input defensively instead.
  pmsMeta: z.string().trim().min(1).optional(),
  intentMeta: z.string().trim().min(1).optional(),

  // Raw URL search string from the page at submit time — surfaced verbatim in
  // the Slack notification so sales can eyeball ad attribution.
  queryParams: z.string().trim().optional(),

  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),

  // Onboarding completion fields — sent when a PM completes onboarding in wOS.
  orgId: z.string().trim().min(1).optional(),
  orgName: z.string().trim().min(1).optional(),
  onboardingComplete: z.boolean().optional(),
  intentOnboarding: z.string().trim().optional(),

  // Caller is not production (e.g. a wander.com preview deployment): the Slack
  // notification goes to #radio-slack-testing instead of the live channel.
  // HubSpot writes are unaffected — same split as the pre-gateway behavior.
  test: z.boolean().optional(),
});
export type InboundBody = z.infer<typeof inboundBody>;
