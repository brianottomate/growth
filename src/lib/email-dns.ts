import { z } from "zod";

/** Change the default here before launch; each prepared brand keeps its own choice. */
export const DEFAULT_MARKETING_SUBDOMAIN = "post";
export const EMAIL_DNS_LINK_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export const emailDnsInputSchema = z.object({
  brandId: z.string().min(1),
  replaceLink: z.boolean().optional(),
  rootDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(
      /^(?![\d.]+$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      "Enter a domain such as wander.com, without https or a path.",
    ),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(63)
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
      "Enter one subdomain, such as news, mail or updates.",
    ),
});

export const brandMarketingDomainSchema = z.strictObject({
  rootDomain: z.string(),
  sendingDomain: z.string(),
  postmarkDomainId: z.number().int().positive(),
  token: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type BrandMarketingDomain = z.infer<typeof brandMarketingDomainSchema>;
export type EmailDnsRecord = {
  type: "TXT" | "CNAME";
  host: string;
  value: string;
  ttl: number;
};
export type EmailDnsStatus = {
  sendingDomain: string;
  records: EmailDnsRecord[];
  dkimVerified: boolean;
  returnPathVerified: boolean;
  verified: boolean;
};

/** DNS changes are confined to the selected marketing subdomain, never the website. */
export function marketingDnsRecords(
  domain: {
    Name: string;
    DKIMHost: string;
    DKIMTextValue: string;
    DKIMPendingHost: string;
    DKIMPendingTextValue: string;
    ReturnPathDomain: string;
    ReturnPathDomainCNAMEValue: string;
  },
  setup: BrandMarketingDomain,
): EmailDnsRecord[] {
  if (domain.Name.toLowerCase() !== setup.sendingDomain)
    throw new Error("Postmark domain does not match this setup.");
  // Pending keys take precedence during rotation as well as initial setup.
  const pending = Boolean(
    domain.DKIMPendingHost && domain.DKIMPendingTextValue,
  );
  const records: EmailDnsRecord[] = [
    {
      type: "TXT",
      host: pending ? domain.DKIMPendingHost : domain.DKIMHost,
      value: pending ? domain.DKIMPendingTextValue : domain.DKIMTextValue,
      ttl: 300,
    },
    {
      type: "CNAME",
      host: domain.ReturnPathDomain,
      value: domain.ReturnPathDomainCNAMEValue,
      ttl: 300,
    },
  ];
  return records.map((record) => {
    const host = record.host.toLowerCase().replace(/\.$/, "");
    if (!host.endsWith(`.${setup.sendingDomain}`) || !record.value)
      throw new Error(
        "Postmark returned incomplete or out-of-scope DNS records.",
      );
    return { ...record, host: host.slice(0, -(setup.rootDomain.length + 1)) };
  });
}

export function suggestedEmailRoot(website: string | null): string {
  if (!website) return "";
  try {
    return new URL(
      website.includes("://") ? website : `https://${website}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
