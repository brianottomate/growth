import "server-only";

import { env } from "@/env";
import { emailDnsInputSchema } from "@/lib/email-dns";
import { emailDnsLinkActive } from "@/server/services/email-dns-link";
import {
  getBrandEmailDns,
  prepareBrandEmailDns,
  recheckEmailDnsConnection,
} from "@/server/services/email-dns.service";
import { z } from "zod";

import { growthAction } from "./types";

const emailDnsRecordSchema = z.strictObject({
  type: z.enum(["TXT", "CNAME"]),
  host: z.string(),
  value: z.string(),
  ttl: z.number().int().positive(),
});

const configuredEmailDnsSchema = z.strictObject({
  configured: z.literal(true),
  rootDomain: z.string(),
  sendingDomain: z.string(),
  records: z.array(emailDnsRecordSchema),
  dkimVerified: z.boolean(),
  returnPathVerified: z.boolean(),
  verified: z.boolean(),
  connectionUrl: z.string().url(),
  connectionActive: z.boolean(),
  expiresAt: z.string().datetime(),
});

const emailDnsStatusSchema = z.union([
  z.strictObject({ configured: z.literal(false) }),
  configuredEmailDnsSchema,
]);

function connectionUrl(path: string) {
  return new URL(path, env.NEXT_PUBLIC_BASE_URL).href;
}

export const readEmailDnsAction = growthAction({
  description:
    "Read a brand's existing marketing-email DNS setup and live Postmark authentication status. Returns the current Entri/manual connection URL when setup exists. verified means both DKIM and return path are verified; it does not schedule or send email.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: emailDnsStatusSchema,
  examples: [{ brandId: "brand_123" }],
  execute: async (input, ctx) => {
    const current = await getBrandEmailDns(input.brandId, ctx.orgId);
    if (!current) return { configured: false as const };
    return {
      configured: true as const,
      rootDomain: current.setup.rootDomain,
      ...current.status,
      connectionUrl: connectionUrl(`/connect/email/${current.setup.token}`),
      connectionActive: emailDnsLinkActive(current.setup),
      expiresAt: current.setup.expiresAt,
    };
  },
});

export const prepareEmailDnsAction = growthAction({
  description:
    "Prepare or retrieve a brand's native Growth email-DNS connection. Reuses the existing Postmark domain and Entri/manual setup page; it changes no DNS records and sends no email. Use replaceLink only to revoke and replace the current connection link.",
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
    "Ask Postmark to recheck a brand's already prepared marketing-email DNS records, then return current authentication status. It changes no DNS records and sends no email.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: configuredEmailDnsSchema,
  examples: [{ brandId: "brand_123" }],
  execute: async (input, ctx) => {
    const current = await getBrandEmailDns(input.brandId, ctx.orgId);
    if (!current)
      throw new Error("Prepare this brand's email DNS connection first.");
    const checked = await recheckEmailDnsConnection(current.setup.token);
    if (!checked)
      throw new Error(
        "The email DNS connection link expired. Prepare a replacement link first.",
      );
    return {
      configured: true as const,
      rootDomain: current.setup.rootDomain,
      sendingDomain: checked.sendingDomain,
      records: checked.records,
      dkimVerified: checked.dkimVerified,
      returnPathVerified: checked.returnPathVerified,
      verified: checked.verified,
      connectionUrl: connectionUrl(`/connect/email/${current.setup.token}`),
      connectionActive: true,
      expiresAt: current.setup.expiresAt,
    };
  },
});
