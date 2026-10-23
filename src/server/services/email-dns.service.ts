import { getEmailDmarcStatus } from "./email-dmarc.service";
import { optionalDmarcRecords } from "@/lib/email-dmarc";
import { isConnectionToken, newConnectionToken } from "./connection-token";
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  brandMarketingDomainSchema,
  emailDnsInputSchema,
  EMAIL_DNS_LINK_LIFETIME_SECONDS,
  marketingDnsRecords,
  type BrandMarketingDomain,
  type EmailDnsStatus,
} from "@/lib/email-dns";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  createEmailEntriConfig,
  isEntriConfigured,
} from "@/server/clients/entri.client";
import {
  getPostmarkDomain,
  type PostmarkDomain,
} from "@/server/clients/postmark.client";
import {
  ensurePostmarkMarketingDomain,
  verifyPostmarkMarketingDomain,
} from "@/server/clients/postmark-domain.client";
import { emailDnsLinkActive } from "./email-dns-link";

async function ownedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}

function statusFor(
  domain: PostmarkDomain,
  setup: BrandMarketingDomain,
): EmailDnsStatus {
  const dkimVerified = domain.DKIMUpdateStatus === "Verified";
  const returnPathVerified = domain.ReturnPathDomainVerified;
  return {
    sendingDomain: setup.sendingDomain,
    records: marketingDnsRecords(domain, setup),
    dkimVerified,
    returnPathVerified,
    verified: dkimVerified && returnPathVerified,
  };
}

/** Explicit operator preparation only. Visiting a client link creates nothing. */
export async function prepareBrandEmailDns(
  input: {
    brandId: string;
    rootDomain: string;
    subdomain: string;
  },
  orgId: string,
) {
  const parsed = emailDnsInputSchema.parse(input);
  const brand = await ownedBrand(parsed.brandId, orgId);
  const sendingDomain = `${parsed.subdomain}.${parsed.rootDomain}`;
  if (sendingDomain.length > 253)
    throw new Error("The sending domain is too long.");
  const current = brandMarketingDomainSchema.safeParse(
    brand.emailSender?.marketingDomain,
  );
  if (
    current.success &&
    current.data.sendingDomain === sendingDomain &&
    current.data.rootDomain === parsed.rootDomain &&
    emailDnsLinkActive(current.data)
  ) {
    const status = statusFor(
      await getPostmarkDomain(current.data.postmarkDomainId),
      current.data,
    );
    return {
      ...status,
      path: `/connect/email/${current.data.token}`,
      expiresAt: current.data.expiresAt,
    };
  }
  const domain = await ensurePostmarkMarketingDomain(sendingDomain);
  const setup: BrandMarketingDomain = {
    rootDomain: parsed.rootDomain,
    sendingDomain,
    postmarkDomainId: domain.ID,
    token: newConnectionToken(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + EMAIL_DNS_LINK_LIFETIME_SECONDS * 1000,
    ).toISOString(),
  };
  // Validate provider scope before saving; preserve all unrelated sender settings.
  const status = statusFor(domain, setup);
  const [saved] = await db
    .update(brandTable)
    .set({
      emailSender: sql`jsonb_build_object('fromName', ${brand.name}::text) || coalesce(${brandTable.emailSender}, '{}'::jsonb) || ${JSON.stringify({ marketingDomain: setup })}::jsonb`,
    })
    .where(
      and(
        eq(brandTable.id, brand.id),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .returning({ id: brandTable.id });
  if (!saved)
    throw new Error("Brand is no longer available in this workspace.");
  return {
    ...status,
    path: `/connect/email/${setup.token}`,
    expiresAt: setup.expiresAt,
  };
}

async function ownedEmailDnsSetup(brandId: string, orgId: string) {
  const brand = await ownedBrand(brandId, orgId);
  const parsed = brandMarketingDomainSchema.safeParse(
    brand.emailSender?.marketingDomain,
  );
  return parsed.success ? parsed.data : null;
}

/** Caller must already own the brand; inspect the loaded sender without re-reading it. */
export async function getEmailDnsForSender(
  sender: { marketingDomain?: unknown } | null,
) {
  const parsed = brandMarketingDomainSchema.safeParse(sender?.marketingDomain);
  if (!parsed.success) return null;
  const setup = parsed.data;
  return {
    setup,
    status: statusFor(await getPostmarkDomain(setup.postmarkDomainId), setup),
  };
}

export async function getBrandEmailDns(brandId: string, orgId: string) {
  const brand = await ownedBrand(brandId, orgId);
  return getEmailDnsForSender(brand.emailSender);
}

/** Workspace authorization is independent of the public link's lifetime. */
export async function recheckBrandEmailDns(brandId: string, orgId: string) {
  const setup = await ownedEmailDnsSetup(brandId, orgId);
  return setup
    ? {
        setup,
        status: statusFor(
          await verifyPostmarkMarketingDomain(setup.postmarkDomainId),
          setup,
        ),
      }
    : null;
}

export class EmailDnsNotPreparedError extends Error {
  constructor() {
    super("Prepare this brand's email DNS connection first.");
  }
}

/** Rotate only the public credential; never re-provision or change its domain. */
export async function replaceBrandEmailDnsLink(brandId: string, orgId: string) {
  const setup = await ownedEmailDnsSetup(brandId, orgId);
  if (!setup) throw new EmailDnsNotPreparedError();
  const issued = {
    token: newConnectionToken(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + EMAIL_DNS_LINK_LIFETIME_SECONDS * 1000,
    ).toISOString(),
  };
  const [saved] = await db
    .update(brandTable)
    .set({
      emailSender: sql`jsonb_set(${brandTable.emailSender}, '{marketingDomain}', (${brandTable.emailSender}->'marketingDomain') || ${JSON.stringify(issued)}::jsonb)`,
    })
    .where(
      and(
        eq(brandTable.id, brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .returning({ id: brandTable.id });
  if (!saved)
    throw new Error("Brand is no longer available in this workspace.");
  return {
    path: `/connect/email/${issued.token}`,
    expiresAt: issued.expiresAt,
  };
}

export async function resolveEmailDnsLink(token: string) {
  if (!isConnectionToken(token)) return null;
  const brand = await db.query.brandTable.findFirst({
    where: and(
      sql`${brandTable.emailSender}->'marketingDomain'->>'token' = ${token}`,
      sql`${brandTable.organizationId} is not null`,
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) return null;
  const parsed = brandMarketingDomainSchema.safeParse(
    brand.emailSender?.marketingDomain,
  );
  if (!parsed.success || !emailDnsLinkActive(parsed.data)) return null;
  return { brand, setup: parsed.data };
}

export async function getEmailDnsConnection(token: string) {
  const resolved = await resolveEmailDnsLink(token);
  if (!resolved) return null;
  const [domain, dmarc] = await Promise.all([
    getPostmarkDomain(resolved.setup.postmarkDomainId),
    getEmailDmarcStatus(
      resolved.setup.rootDomain,
      resolved.setup.sendingDomain,
    ),
  ]);
  const status = statusFor(domain, resolved.setup);
  return {
    brandName: resolved.brand.name,
    rootDomain: resolved.setup.rootDomain,
    automaticAvailable: isEntriConfigured(),
    dmarc,
    status,
  };
}

export async function startEmailDnsConnection(
  token: string,
  includeStarterDmarc = false,
) {
  const resolved = await resolveEmailDnsLink(token);
  if (!resolved) return null;
  const domain = await getPostmarkDomain(resolved.setup.postmarkDomainId);
  return createEmailEntriConfig({
    rootDomain: resolved.setup.rootDomain,
    brandId: resolved.brand.id,
    records: [
      ...marketingDnsRecords(domain, resolved.setup),
      ...optionalDmarcRecords(
        await getEmailDmarcStatus(
          resolved.setup.rootDomain,
          resolved.setup.sendingDomain,
        ),
        includeStarterDmarc,
      ),
    ],
  });
}

export async function recheckEmailDnsConnection(token: string) {
  const resolved = await resolveEmailDnsLink(token);
  if (!resolved) return null;
  const domain = await verifyPostmarkMarketingDomain(
    resolved.setup.postmarkDomainId,
  );
  return {
    ...statusFor(domain, resolved.setup),
    dmarc: await getEmailDmarcStatus(
      resolved.setup.rootDomain,
      resolved.setup.sendingDomain,
    ),
  };
}
