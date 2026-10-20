import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loadPerformanceBrand } from "@/app/app/performance/clients/[brandSlug]/_data";
import { CaseStudyView } from "@/app/report/[token]/CaseStudyView";
import {
  getReportWorkspace,
  reportPage,
} from "@/server/services/performance-report.service";

import { CaseStudyControls } from "./CaseStudyControls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Case study · Wander" },
  robots: { index: false, follow: false },
};

/**
 * A case study for sales, exported with the browser's Save as PDF. Signed-in
 * teammates only: the downloaded PDF is the copy that goes out, so there is
 * no share link. It sits outside /app so the app shell never prints.
 */
export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ brandSlug: string; reportId: string }>;
}) {
  const { brandSlug, reportId } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org || !brand) notFound();
  const workspace = await getReportWorkspace(org.id, brand.id);
  const draft = workspace.reports.find((report) => report.id === reportId);
  const study = draft?.content.caseStudy;
  if (!draft || !study) notFound();

  return (
    <CaseStudyView
      report={reportPage({
        ...draft.content,
        clientName: workspace.clientName,
        status: "draft",
        publishedAt: null,
      })}
      study={study}
      controls={<CaseStudyControls brandId={brand.id} draft={draft} />}
    />
  );
}
