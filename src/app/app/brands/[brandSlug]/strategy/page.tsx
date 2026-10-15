import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getBrandStrategy } from "@/server/services/cadence.service";
import { PersonasClient } from "@/app/app/audiences/PersonasClient";

import { BrandContentMix } from "../BrandStrategyClient";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/strategy — the enduring decisions for a brand:
 * the content mix by pillar and the personas it talks to. Kept apart from the
 * brand-map cockpit, which is the live operational readout (cadence, health).
 */
export default async function BrandStrategyPage({
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
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) notFound();

  const inspirations = await db.query.brandInspirationTable.findMany({
    where: eq(brandInspirationTable.brandId, brand.id),
    columns: { inspirationBrandId: true },
  });
  const peerBrandIds = inspirations.map((row) => row.inspirationBrandId);

  const strategy = await getBrandStrategy(brand.id, { peerBrandIds });
  const slug = brand.slug ?? brandSlug;

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
            href={`/app/brands/${slug}`}
            className="text-muted-foreground hover:underline"
          >
            {brand.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">Strategy</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {brand.name}{" "}
            <span className="text-base font-normal text-muted-foreground">
              strategy
            </span>
          </h1>
          <Link
            href={`/app/brands/${slug}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Channel cadence ↗
          </Link>
        </div>
      </header>

      <section>
        <BrandContentMix brandId={brand.id} strategy={strategy} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Audiences</h2>
        <PersonasClient
          brands={[{ id: brand.id, name: brand.name }]}
          embedded
        />
      </section>
    </div>
  );
}
