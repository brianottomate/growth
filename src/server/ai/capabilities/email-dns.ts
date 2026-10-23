import "server-only";

import { getEmailDmarcStatus } from "@/server/services/email-dmarc.service";
import { env } from "@/env";
import { emailDnsInputSchema } from "@/lib/email-dns";
import { emailDnsLinkActive } from "@/server/services/email-dns-link";
import {
  getBrandEmailDns,
  EmailDnsNotPreparedError,
  prepareBrandEmailDns,
  recheckBrandEmailDns,
  replaceBrandEmailDnsLink,
} from "@/server/services/email-dns.service";
import { z } from "zod";

import { growthAction, GrowthActionError } from "./types";
import { configuredEmailDnsSchema } from "./outputs/email-dns";

function connectionUrl(path: string) {
  return new URL(path, env.NEXT_PUBLIC_BASE_URL).href;
}

export async function emailDnsForAssistant(
  current: NonNullable<Awaited<ReturnType<typeof getBrandEmailDns>>>,
) {
  return {
    configured: true as const,
    rootDomain: current.setup.rootDomain,
    ...current.status,
    dmarc: await getEmailDmarcStatus(
      current.setup.rootDomain,
      current.setup.sendingDomain,
    ),
    connectionUrl: connectionUrl(`/connect/email/${current.setup.token}`),
    connectionActive: emailDnsLinkActive(current.setup),
    expiresAt: current.setup.expiresAt,
  };
}

export const prepareEmailDnsAction = growthAction({
  description:
    "Prepare or retrieve a brand's native Growth email-DNS connection. This may create or adopt the brand's Postmark sending domain and stores the setup on the brand, but it changes no DNS records and sends no email. Return the 180-day Growth connectionUrl to the client; that page creates a short-lived Entri session only after the client clicks. Never send an Entri session URL directly. Reuses the current active link for the same domain. Revoke an existing link only with replaceEmailDnsLink.",
  inputSchema: emailDnsInputSchema,
  outputSchema: configuredEmailDnsSchema,
  examples: [
    {
      brandId: "brand_123",
      rootDomain: "example.com",
      subdomain: "post",
    },
  ],
  execute: async (input, ctx) => {
    const prepared = await prepareBrandEmailDns(input, ctx.orgId);
    return {
      configured: true as const,
      rootDomain: input.rootDomain,
      sendingDomain: prepared.sendingDomain,
      records: prepared.records,
      dmarc: await getEmailDmarcStatus(
        input.rootDomain,
        prepared.sendingDomain,
      ),
      dkimVerified: prepared.dkimVerified,
      returnPathVerified: prepared.returnPathVerified,
      verified: prepared.verified,
      connectionUrl: connectionUrl(prepared.path),
      connectionActive: true,
      expiresAt: prepared.expiresAt,
    };
  },
});

export const recheckEmailDnsAction = growthAction({
  description:
    "Ask Postmark to refresh verification for a brand's already prepared marketing-email DNS records, then return current authentication status. This writes provider verification state but changes no DNS records and sends no email.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: configuredEmailDnsSchema,
  examples: [{ brandId: "brand_123" }],
  execute: async (input, ctx) => {
    const current = await recheckBrandEmailDns(input.brandId, ctx.orgId);
    if (!current)
      throw new GrowthActionError(
        "invalid_input",
        "Prepare this brand's email DNS connection first.",
      );
    return emailDnsForAssistant(current);
  },
});

export const replaceEmailDnsLinkAction = growthAction({
  description:
    "Revoke and replace a brand's client email-DNS connection link. The old link immediately stops working. Preserves the sending domain and provider configuration; changes no DNS records and sends no email.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.strictObject({
    connectionUrl: z.string().url(),
    expiresAt: z.string().datetime(),
  }),
  execute: async (input, ctx) => {
    try {
      const replaced = await replaceBrandEmailDnsLink(input.brandId, ctx.orgId);
      return {
        connectionUrl: connectionUrl(replaced.path),
        expiresAt: replaced.expiresAt,
      };
    } catch (error) {
      if (error instanceof EmailDnsNotPreparedError)
        throw new GrowthActionError("invalid_input", error.message);
      throw error;
    }
  },
});
