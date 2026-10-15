import "server-only";
import { and, eq, isNull } from "drizzle-orm";

import { optionalDmarcRecords } from "@/lib/email-dmarc";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { brandIntakeUrl } from "@/server/services/brand-connect.service";
import { getEmailDmarcStatus } from "@/server/services/email-dmarc.service";
import { getBrandEmailDns } from "@/server/services/email-dns.service";
import { privatePerformanceLinks } from "@/lib/performance-client-links";

import { OnboardingEmail } from "./OnboardingEmail";

/** Clients always get production links, whichever deployment renders this. */

/** Copy-ready onboarding at every setup stage; DNS records are optional. */
export async function OnboardingEmailCard({
  brandId,
  orgId,
}: {
  brandId: string;
  orgId: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      name: true,
      slug: true,
      connectToken: true,
      emailDelivery: true,
      emailSender: true,
    },
  });
  if (!brand) return null;

  const dns =
    brand.emailDelivery?.provider === "postmark"
      ? await getBrandEmailDns(brandId, orgId).catch(
          () => "unavailable" as const,
        )
      : null;
  const available = dns && dns !== "unavailable" ? dns : null;
  const dmarc = available
    ? await getEmailDmarcStatus(
        available.setup.rootDomain,
        available.setup.sendingDomain,
      )
    : null;
  const setup = available?.setup;
  const handle = brand.connectToken ?? brand.slug;
  const privateLinks = privatePerformanceLinks(
    true,
    brand.connectToken,
    brand.emailSender?.marketingDomain,
  );
  return (
    <OnboardingEmail
      brandName={brand.name}
      rootDomain={setup?.rootDomain ?? ""}
      sendingDomain={setup?.sendingDomain ?? ""}
      verified={available?.status.verified ?? false}
      records={
        available
          ? [
              ...available.status.records,
              ...(dmarc ? optionalDmarcRecords(dmarc, true) : []),
            ]
          : []
      }
      links={{
        intake: handle ? brandIntakeUrl(handle) : null,
        connect: privateLinks.connect,
        dns: privateLinks.emailDns,
      }}
    />
  );
}
