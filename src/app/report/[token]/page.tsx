import type { Metadata } from "next";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { loadPerformanceReportPage } from "@/server/services/performance-report.service";

import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Performance report · Wander" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * A client's performance report. No login and no session: the token in the
 * URL is the credential. Light theme, because the page is saved to PDF or PNG
 * as often as it is read. Everything shown is the report's stored snapshot.
 */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await loadPerformanceReportPage(token);
  if (!report)
    return (
      <main
        data-theme="light"
        className="grid min-h-screen place-items-center bg-surface-primary px-6 text-primary"
      >
        <div className="max-w-sm text-center">
          <Logo variant="logomark" className="mx-auto mb-6 h-10 w-auto" />
          <h1 className="text-xl font-semibold">
            This link is no longer active
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask your Wander contact for a fresh report link.
          </p>
        </div>
      </main>
    );
  const imageUrl = (src: string | undefined) =>
    src?.startsWith("https://")
      ? `/report/${token}/media?u=${encodeURIComponent(src)}`
      : src;
  return (
    <ReportView
      token={token}
      report={{
        ...report,
        highlights: report.highlights.map((highlight) => ({
          ...highlight,
          imageUrl: imageUrl(highlight.imageUrl),
        })),
      }}
    />
  );
}
