import { notFound, redirect } from "next/navigation";
import { getReportWorkspace } from "@/server/services/performance-report.service";
import { db } from "@/server/db";
import { performanceAccountTable } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { loadPerformanceBrand } from "../_data";
import { ReportsEditor } from "./ReportsEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports · Wander Performance" };
export default async function ReportsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org || !brand) notFound();
  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      eq(performanceAccountTable.organizationId, org.id),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!account)
    return (
      <p className="py-8 text-muted-foreground">
        Create this client’s Performance account before writing a report.
      </p>
    );
  const workspace = await getReportWorkspace(org.id, brand.id);
  return (
    <ReportsEditor
      brandId={brand.id}
      brandSlug={brandSlug}
      initial={workspace}
    />
  );
}
