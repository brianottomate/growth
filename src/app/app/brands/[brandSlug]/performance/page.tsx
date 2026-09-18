import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import {
  brandIntakeUrl,
  brandPitchUrl,
} from "@/server/services/brand-connect.service";

import { PerformanceChecklistForm } from "./PerformanceChecklistForm";

// Static Wander agency Leadsie grant, one link for all clients (mirrors ClientConnectCard).
const LEADSIE_URL = "https://app.leadsie.com/connect/wander/manage";

export const dynamic = "force-dynamic";

export default async function BrandPerformanceChecklistPage({
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
    columns: { id: true, name: true, slug: true, performanceChecklist: true },
  });
  if (!brand) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/app/brands" className="hover:text-foreground">
          Brands
        </Link>
        <span>/</span>
        <Link
          href={`/app/brands/${brandSlug}`}
          className="hover:text-foreground"
        >
          {brand.name}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">Performance</span>
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {brand.name} · Performance checklist
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Where this client stands. Filled by hand; each item records who set it.
      </p>
      <PerformanceChecklistForm
        brandId={brand.id}
        initial={brand.performanceChecklist ?? null}
        links={{
          intake: brand.slug ? brandIntakeUrl(brand.slug) : null,
          pitch: brand.slug ? brandPitchUrl(brand.slug) : null,
          leadsie: LEADSIE_URL,
        }}
      />
    </div>
  );
}
