import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Building2 } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { BUSINESS_LABEL, DELIVERY_LABEL } from "@/lib/performance-stage";
import {
  BrandSearch,
  type BrandSearchGroup,
} from "@/app/app/brands/BrandSearch";
import {
  loadPerformanceDesk,
  narrowDesk,
  type DeskBrand,
} from "@/server/services/performance-desk.service";
import { loadBrandReadiness } from "@/server/services/performance-readiness.service";

import { ClientCard } from "../ClientCard";
import { PerformancePageHeader } from "../PageHeader";
import { HeaderNewClient } from "../HeaderNewClient";

export const metadata: Metadata = { title: "Clients · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The clients as a list, filtered on the page the way /brands is: one row per
 * client or prospect with what they filed on the intake form, where they
 * stand on the production checklist, where their campaigns are, and the
 * intake link to send when they have not filed yet.
 */
export default async function PerformanceClientsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "client");
  const readiness = await loadBrandReadiness(desk.brands);

  const entry = (brand: DeskBrand) => ({
    key: brand.id,
    search: [
      brand.name,
      brand.slug,
      brand.website,
      brand.relationship,
      BUSINESS_LABEL[brand.business],
      DELIVERY_LABEL[brand.delivery],
      brand.billing
        ? `fee ${brand.billing.fee.paidAt ? "paid" : "open"} ads ${brand.billing.media.paidAt ? "paid" : "open"}`
        : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    node: (
      <ClientCard brand={brand} readiness={readiness.get(brand.id) ?? null} />
    ),
  });
  // Unpaid first: that is the list someone asks about in Slack.
  const unpaid = desk.brands.filter((brand) => brand.business === "signed");
  const paid = desk.brands.filter((brand) => brand.business === "paid");
  const paused = desk.brands.filter((brand) => brand.business === "paused");
  const groups: BrandSearchGroup[] = [
    ...(unpaid.length
      ? [{ label: "Signed, not paid", entries: unpaid.map(entry) }]
      : []),
    ...(paid.length ? [{ label: "Paid", entries: paid.map(entry) }] : []),
    ...(paused.length ? [{ label: "Paused", entries: paused.map(entry) }] : []),
  ];

  return (
    <div className="space-y-2">
      <PerformancePageHeader
        title="Clients"
        description="Each client with their intake, homes, checklist and campaigns."
        action={<HeaderNewClient />}
      />
      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Prospects become clients on the Prospects tab."
        />
      ) : (
        <BrandSearch groups={groups} />
      )}
    </div>
  );
}
