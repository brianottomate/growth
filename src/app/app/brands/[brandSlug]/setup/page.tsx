import { SharedAdsConnections } from "../SharedAdsConnections";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";

import { AdAccountsCard } from "../AdAccountsCard";
import { ClientConnectCard } from "../ClientConnectCard";
import { WanderOsSiteCard } from "../WanderOsSiteCard";
import { PurgeBrandCard } from "../PurgeBrandCard";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/setup — the onboarding surface. Everything needed
 * to wire a brand up (the client connect link, the ad-account allowlist)
 * lives here, visited heavily during onboarding and rarely after — which is
 * why it is not on the brand overview.
 */
export default async function BrandSetupPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/app/brands"
            className="text-muted-foreground hover:underline"
          >
            Brands
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link
            href={`/app/brands/${brandSlug}`}
            className="text-muted-foreground hover:underline"
          >
            {brand.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">setup</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {brand.name}{" "}
          <span className="text-base font-normal text-muted-foreground">
            setup
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect the client&apos;s accounts and decide which ad accounts this
          brand may consume. Once this page is green, the work happens on the
          brand and ads pages.
        </p>
      </header>

      <ClientConnectCard brandId={brand.id} />

      <WanderOsSiteCard brandId={brand.id} />

      <AdAccountsCard brandId={brand.id} brandSlug={brand.slug ?? brandSlug} />
      <SharedAdsConnections brandId={brand.id} />

      <PurgeBrandCard brandId={brand.id} brandName={brand.name} />
    </div>
  );
}
