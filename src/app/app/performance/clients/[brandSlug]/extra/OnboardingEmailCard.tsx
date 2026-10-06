import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";

import { EmptyState } from "@/components/ui/empty-state";
import { optionalDmarcRecords } from "@/lib/email-dmarc";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { brandIntakeUrl } from "@/server/services/brand-connect.service";
import { getEmailDmarcStatus } from "@/server/services/email-dmarc.service";
import { getBrandEmailDns } from "@/server/services/email-dns.service";
import { emailDnsLinkActive } from "@/server/services/email-dns-link";

import { WorkspaceCard } from "../../../WorkspaceCard";
import { OnboardingEmail } from "./OnboardingEmail";

/** Clients always get production links, whichever deployment renders this. */
const GROWTH_PROD_URL = "https://growth-red.vercel.app";

/** Copy-ready welcome email; only for brands that already send through Postmark. */
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
    },
  });
  if (!brand) return null;

  const blocked = (title: string, href?: string) => (
    <WorkspaceCard title="Onboarding email" icon={Mail}>
      <EmptyState
        compact
        icon={Mail}
        title={title}
        actions={
          href ? (
            <Button asChild size="sm">
              <Link href={href}>Open Email tab</Link>
            </Button>
          ) : null
        }
      />
    </WorkspaceCard>
  );
  if (brand.emailDelivery?.provider !== "postmark")
    return blocked("No Postmark server yet");

  const dns = await getBrandEmailDns(brandId, orgId).catch(
    () => "unavailable" as const,
  );
  if (dns === "unavailable") return blocked("Postmark records unavailable");
  if (!dns)
    return blocked(
      "No sending domain yet",
      `/app/performance/clients/${brand.slug ?? brandId}/newsletters`,
    );

  const { setup, status } = dns;
  const dmarc = await getEmailDmarcStatus(
    setup.rootDomain,
    setup.sendingDomain,
  );
  const handle = brand.slug ?? brand.connectToken;
  return (
    <OnboardingEmail
      brandName={brand.name}
      rootDomain={setup.rootDomain}
      sendingDomain={setup.sendingDomain}
      verified={status.verified}
      records={[...status.records, ...optionalDmarcRecords(dmarc, true)]}
      links={{
        intake: handle ? brandIntakeUrl(handle) : null,
        connect: brand.connectToken
          ? `${GROWTH_PROD_URL}/connect/${brand.connectToken}`
          : null,
        dns: emailDnsLinkActive(setup)
          ? `${GROWTH_PROD_URL}/connect/email/${setup.token}`
          : null,
      }}
    />
  );
}
