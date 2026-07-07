import { NextResponse, after, type NextRequest } from "next/server";

import { isHubspotConfigured } from "@/server/clients/hubspot.client";
import {
  inboundBody,
  requireGatewayAuth,
} from "@/server/services/hubspot-gateway.service";
import {
  extractDomain,
  extractEmailDomain,
  normalizeSiteUrl,
  osInboundLeadRouter,
} from "@/server/services/inbound-router.service";

// The router makes ~a dozen sequential HubSpot calls plus a Claude PMS-mapping
// call; typically well under a minute, but give it the fluid-compute ceiling.
export const maxDuration = 800;

/**
 * Inbound lead router — classify, round-robin assign, upsert to HubSpot,
 * notify sales on Slack. Accept-then-process: responds 200 as soon as the
 * payload validates and routes via after(), so form submits never wait on
 * HubSpot. Called by wander.com's /api/os/inbound.
 * POST /api/hubspot/v1/inbound  { email, numberOfProperties, source, ... }
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;
  if (!isHubspotConfigured) {
    return NextResponse.json(
      { success: false, error: "HubSpot is not configured" },
      { status: 503 },
    );
  }

  const parsed = inboundBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    email,
    directBookingSiteUrl,
    numberOfProperties,
    source,
    pmsMeta,
    intentMeta,
    intentOnboarding,
    queryParams,
    orgId,
    orgName,
    onboardingComplete,
    firstName,
    lastName,
    phone,
    test,
  } = parsed.data;
  const effectiveIntentMeta = intentMeta ?? intentOnboarding;

  // Defense in depth — wander.com short-circuits internal emails too.
  if (email.toLowerCase().endsWith("@wander.com")) {
    return NextResponse.json({ success: true, skipped: "internal email" });
  }

  const normalizedSiteUrl = directBookingSiteUrl
    ? normalizeSiteUrl(directBookingSiteUrl)
    : null;
  // When the user provides a website, extract the domain for the HubSpot company
  // lookup. No website → domain is null and the router skips the company search.
  const companyDomain = normalizedSiteUrl
    ? extractDomain(normalizedSiteUrl)
    : extractEmailDomain(email);

  // Route without blocking the response. after() keeps the function instance
  // alive until routing finishes; errors inside the router are caught and
  // logged per-step.
  after(() =>
    osInboundLeadRouter({
      email,
      domain: companyDomain,
      siteUrl: normalizedSiteUrl,
      numberOfProperties,
      source,
      pmsMeta,
      intentMeta: effectiveIntentMeta,
      queryParams,
      orgId,
      orgName,
      onboardingComplete,
      firstName,
      lastName,
      phone,
      test,
    }),
  );

  return NextResponse.json({ success: true });
}
