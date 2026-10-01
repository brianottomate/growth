import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { googleAdsClient } from "@/server/clients/google-ads.client";
import { googleAdsCustomerId } from "@/server/clients/google-ads.transport";
import { db } from "@/server/db";
import { adAccountTable } from "@/server/db/ad-account-schema";
import { brandTable } from "@/server/db/brand-schema";
import { conversionMappingTable } from "@/server/db/conversions-schema";

// Performance clients are US vacation-rental brands billed through Wander.
const CURRENCY = "USD";
const TIME_ZONE = "America/New_York";

async function brandBySlug(slug: string, organizationId?: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, slug),
      isNull(brandTable.deletedAt),
      organizationId
        ? eq(brandTable.organizationId, organizationId)
        : undefined,
    ),
  });
  if (!brand) throw new Error(`No brand with slug ${slug}`);
  return brand;
}

function managerId() {
  if (!env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    throw new Error("GOOGLE_ADS_LOGIN_CUSTOMER_ID is not configured");
  return googleAdsCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
}

async function ownGoogleAccount(brandId: string) {
  return db.query.adAccountTable.findFirst({
    where: and(
      eq(adAccountTable.brandId, brandId),
      eq(adAccountTable.platform, "google"),
      eq(adAccountTable.isShared, false),
    ),
  });
}

/**
 * Creates the brand's own Google Ads account under Wander's MCC and allows it.
 * Currency and time zone are permanent once created. A brand that already has
 * its own Google account gets that row back instead of a second account, and
 * an MCC child already named for the brand (a run that died before recording
 * it) is recorded instead of created again.
 */
export async function createBrandGoogleAdsAccount(input: {
  brandSlug: string;
  organizationId?: string;
  validateOnly?: boolean;
}) {
  const brand = await brandBySlug(input.brandSlug, input.organizationId);
  const existing = await ownGoogleAccount(brand.id);
  if (existing) return { created: false as const, account: existing };

  const manager = managerId();
  const [orphan] = await googleAdsClient.search<{
    customerClient: { id: string };
  }>(
    manager,
    `SELECT customer_client.id FROM customer_client WHERE customer_client.level = 1 AND customer_client.status = 'ENABLED' AND customer_client.descriptive_name = '${brand.name.replace(/'/g, "\\'")}'`,
  );
  if (orphan && input.validateOnly)
    return { created: false as const, account: null };
  const response = orphan
    ? { resourceName: `customers/${orphan.customerClient.id}` }
    : await googleAdsClient.post<{ resourceName?: string }>(
        manager,
        ":createCustomerClient",
        {
          customerClient: {
            descriptiveName: brand.name,
            currencyCode: CURRENCY,
            timeZone: TIME_ZONE,
          },
          validateOnly: input.validateOnly ?? false,
        },
      );
  if (input.validateOnly) return { created: false as const, account: null };

  const customerId = response.resourceName?.split("/")[1];
  if (!customerId) throw new Error("Google returned no customer resource");
  const [account] = await db
    .insert(adAccountTable)
    .values({
      platform: "google",
      externalId: customerId,
      name: brand.name,
      brandId: brand.id,
      isAllowed: true,
      managerExternalId: manager,
      createdByUs: true,
      note: `Created under MCC ${manager} by Growth`,
    })
    .returning();
  return { created: true as const, account: account! };
}

type ConversionActionRow = {
  conversionAction: {
    resourceName: string;
    tagSnippets?: { eventSnippet?: string }[];
  };
};

/**
 * Creates the one booking conversion action on the brand's own Google account
 * and records it, with the AW-…/label the site fires.
 */
export async function createBrandGoogleBookingConversion(input: {
  brandSlug: string;
  organizationId?: string;
  validateOnly?: boolean;
}) {
  const brand = await brandBySlug(input.brandSlug, input.organizationId);
  const account = await ownGoogleAccount(brand.id);
  if (!account) throw new Error(`${brand.name} has no Google Ads account yet`);
  if (!account.isAllowed)
    throw new Error(`${account.externalId} is denied in the allowlist`);

  const existing = await db.query.conversionMappingTable.findFirst({
    where: eq(conversionMappingTable.adAccountId, account.id),
  });
  if (existing) return { created: false as const, conversion: existing };

  const [orphan] = await googleAdsClient.search<ConversionActionRow>(
    account.externalId,
    "SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.name = 'Booking' AND conversion_action.status = 'ENABLED'",
  );
  if (orphan && input.validateOnly)
    return { created: false as const, conversion: null };
  const response = orphan
    ? { results: [{ resourceName: orphan.conversionAction.resourceName }] }
    : await googleAdsClient.post<{
        results?: { resourceName: string }[];
      }>(account.externalId, "/conversionActions:mutate", {
        operations: [
          {
            create: {
              name: "Booking",
              type: "WEBPAGE",
              category: "PURCHASE",
              status: "ENABLED",
              countingType: "ONE_PER_CLICK",
              primaryForGoal: true,
              valueSettings: {
                defaultValue: 0,
                defaultCurrencyCode: CURRENCY,
                alwaysUseDefaultValue: false,
              },
            },
          },
        ],
        validateOnly: input.validateOnly ?? false,
      });
  if (input.validateOnly) return { created: false as const, conversion: null };

  const resourceName = response.results?.[0]?.resourceName;
  if (!resourceName) throw new Error("Google returned no conversion action");
  const [row] = await googleAdsClient.search<ConversionActionRow>(
    account.externalId,
    `SELECT conversion_action.resource_name, conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${resourceName}'`,
  );
  const sendTo = row?.conversionAction.tagSnippets
    ?.map((snippet) => snippet.eventSnippet?.match(/AW-\d+\/[\w-]+/)?.[0])
    .find(Boolean);

  const [conversion] = await db
    .insert(conversionMappingTable)
    .values({
      brandId: brand.id,
      platform: "google_ads",
      adAccountId: account.id,
      platformEventName: "Booking",
      externalConversionId: sendTo ?? null,
      externalResourceName: resourceName,
      mode: "once",
      notes: "Created by Growth on the brand's own Google Ads account",
    })
    .returning();
  return { created: true as const, conversion: conversion! };
}

/**
 * The brand's own Google Ads account and its booking conversion, made on
 * demand from the brand's Ads page, once. Both steps reuse what exists, so a
 * run that stopped halfway continues instead of duplicating.
 */
export async function ensureBrandGoogleAdsAccount(
  input: { brandSlug: string },
  context: { organizationId: string },
) {
  const brand = await brandBySlug(input.brandSlug, context.organizationId);
  if (brand.relationship !== "client") {
    throw new Error("Google Ads accounts are for Performance clients.");
  }
  const scope = {
    brandSlug: input.brandSlug,
    organizationId: context.organizationId,
  };
  const { created, account } = await createBrandGoogleAdsAccount(scope);
  if (!account) throw new Error("Google returned no account");
  const { conversion } = await createBrandGoogleBookingConversion(scope);
  return {
    customerId: account.externalId,
    name: account.name,
    accountCreated: created,
    conversionLabel: conversion?.externalConversionId ?? null,
  };
}
