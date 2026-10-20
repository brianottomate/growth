import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { brandMarketingDomainSchema } from "@/lib/email-dns";
import { privatePerformanceLinks } from "@/lib/performance-client-links";
import type { IntakeEmailPreferences } from "@/lib/intake-email-preferences";
import { db } from "@/server/db";
import { brandTable, performanceIntakeTable } from "@/server/db/schema";

import {
  getBrandByConnectToken,
  getBrandConnectStatus,
  selectMetaAccountByConnectToken,
  startBrandConnect,
  syncBrandConnect,
  type BrandConnectChannelKey,
} from "./brand-connect.service";
import {
  getEmailDnsConnection,
  recheckEmailDnsConnection,
} from "./email-dns.service";
import { intakeSetupSummary } from "@/lib/intake-setup-status";
import { getMetaConnectChoice } from "./meta-connect-setup.service";
import { loadPerformanceConnections } from "./performance-connections.service";
import { notifyPerformanceIntakeEmail } from "./performance-intake-notification.service";
import { setPerformanceSettings } from "./performance-settings.service";

/**
 * The intake's sections after the brand section is sent, by private token.
 *
 * Every value is read from the record that owns it: the latest intake row,
 * the brand's connected channels, its marketing domain at Postmark, its email
 * sender and Performance settings. Nothing is a draft, so a client can leave
 * and come back to any section in any order. Never reachable by slug: this
 * shows what was sent and which accounts are connected.
 */

/** What the intake asks to connect: ads to run, social so ads run as the brand. */
export const INTAKE_CONNECT_KEYS = [
  "meta-ads",
  "google-ads",
  "instagram",
  "facebook",
] as const satisfies readonly BrandConnectChannelKey[];

export type IntakeConnectChannel = (typeof INTAKE_CONNECT_KEYS)[number];

const CHANNEL_GROUP: Record<IntakeConnectChannel, "ads" | "social"> = {
  "meta-ads": "ads",
  "google-ads": "ads",
  instagram: "social",
  facebook: "social",
};

export async function intakeSetup(token: string) {
  const brand = await getBrandByConnectToken(token);
  if (!brand) return null;

  const [latest] = await db
    .select({
      submittedAt: performanceIntakeTable.submittedAt,
      answers: performanceIntakeTable.answers,
    })
    .from(performanceIntakeTable)
    .where(eq(performanceIntakeTable.brandId, brand.id))
    .orderBy(desc(performanceIntakeTable.submittedAt))
    .limit(1);

  const status = await getBrandConnectStatus(brand.id);
  const connections = INTAKE_CONNECT_KEYS.map((key) => {
    const row = status.find((candidate) => candidate.key === key);
    return {
      key,
      label: row?.label ?? key,
      group: CHANNEL_GROUP[key],
      connected: row?.connected ?? false,
      account: row?.accounts[0] || row?.externalIds[0] || null,
    };
  });

  const metaConnected = connections.some(
    (row) => row.key === "meta-ads" && row.connected,
  );
  // The same account choice and checks the connect page shows inside its
  // Meta Ads row: who pays, billing, and tracking.
  let metaChoice: Awaited<ReturnType<typeof getMetaConnectChoice>> = null;
  let metaChecks: ReturnType<typeof intakeSetupSummary>["checks"] = [];
  let metaUnavailable = false;
  if (metaConnected) {
    try {
      metaChoice = await getMetaConnectChoice(brand.id);
      if (!metaChoice) metaUnavailable = true;
      if (metaChoice?.selectedId) {
        const summary = (
          await loadPerformanceConnections(brand.organizationId!, [brand.id])
        ).get(brand.id);
        if (summary)
          metaChecks = intakeSetupSummary(
            summary,
            "unknown",
            "unknown",
            true,
          ).checks.filter((check) =>
            ["meta", "billing", "pixel"].includes(check.key),
          );
      }
    } catch (error) {
      console.error("intake setup: meta accounts unavailable", error);
      metaUnavailable = true;
    }
  }

  return {
    sentAt: latest?.submittedAt.toISOString() ?? null,
    answers: latest?.answers ?? null,
    connections: connections.map((row) =>
      row.key === "meta-ads" && metaChoice && !metaChoice.selectedId
        ? { ...row, connected: false, account: null }
        : row,
    ),
    metaChoice,
    metaChecks,
    metaUnavailable,
    emailDomain: await emailDomainFor(brand.emailSender?.marketingDomain),
    email: {
      replyTo: brand.emailSender?.replyTo ?? null,
      preferences: brand.performanceSettings?.emailPreferences ?? null,
    },
  };
}

/**
 * The marketing domain as the intake shows it. `null` until an operator has
 * prepared one: the subdomain is our call, so visiting a link creates nothing.
 */
async function emailDomainFor(marketingDomain: unknown) {
  const token = activeDomainToken(marketingDomain);
  if (!token) return null;
  const link = privatePerformanceLinks(true, null, marketingDomain).emailDns;
  try {
    const connection = await getEmailDnsConnection(token);
    if (!connection) return null;
    return {
      ...connection.status,
      rootDomain: connection.rootDomain,
      // Entri runs on Growth's own page; the records work anywhere.
      automaticUrl: connection.automaticAvailable ? link : null,
    };
  } catch (error) {
    console.error("intake setup: email domain unavailable", error);
    return { unavailable: true as const };
  }
}

function activeDomainToken(marketingDomain: unknown) {
  const setup = brandMarketingDomainSchema.safeParse(marketingDomain);
  return setup.success && Date.parse(setup.data.expiresAt) > Date.now()
    ? setup.data.token
    : null;
}

export async function startIntakeConnect(
  token: string,
  channel: IntakeConnectChannel,
) {
  return startBrandConnect(token, channel, "intake");
}

/** After OAuth returns to the intake, pull the new accounts into channel rows. */
export async function syncIntakeConnect(token: string, connected: string) {
  const brand = await getBrandByConnectToken(token);
  if (!brand) return null;
  await syncBrandConnect(brand.id);
  return { ok: true };
}

export async function selectIntakeMetaAccount(
  token: string,
  adAccountId: string,
) {
  return selectMetaAccountByConnectToken(token, adAccountId);
}

export async function recheckIntakeEmailDomain(token: string) {
  const brand = await getBrandByConnectToken(token);
  if (!brand) return null;
  const dnsToken = activeDomainToken(brand.emailSender?.marketingDomain);
  if (!dnsToken) return null;
  const status = await recheckEmailDnsConnection(dnsToken);
  if (!status) return null;
  const { dmarc: _dmarc, ...rest } = status;
  return rest;
}

/**
 * The email section's send. Reply-to lives on `emailSender`, which every
 * brand email reads; what we may send lives on Performance settings. A
 * second send replaces the first: an update, not a receipt.
 */
export async function saveIntakeEmailPreferences(
  token: string,
  input: {
    replyTo: string;
    preferences: IntakeEmailPreferences;
  },
) {
  const brand = await getBrandByConnectToken(token);
  if (!brand?.organizationId) return null;
  await db
    .update(brandTable)
    .set({
      emailSender: sql`jsonb_build_object('fromName', ${brand.name}::text) || coalesce(${brandTable.emailSender}, '{}'::jsonb) || ${JSON.stringify({ replyTo: input.replyTo })}::jsonb`,
    })
    .where(eq(brandTable.id, brand.id));
  await setPerformanceSettings({
    brandId: brand.id,
    orgId: brand.organizationId,
    patch: { emailPreferences: input.preferences },
    by: null,
    from: "intake",
  });
  after(() =>
    notifyPerformanceIntakeEmail({
      brandName: brand.name,
      brandSlug: brand.slug,
      replyTo: input.replyTo,
      programs: input.preferences.programs,
    }),
  );
  return { ok: true };
}
