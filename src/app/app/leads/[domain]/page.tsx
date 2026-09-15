import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProspectDetail } from "../ProspectDetail";

/**
 * One prospect at full bleed.
 *
 * A real route rather than only a drawer, so a prospect can be linked to in
 * Slack, and so page-context can resolve "this prospect" when the operator asks
 * the assistant about what is on their screen.
 */
export default async function ProspectPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const decoded = decodeURIComponent(domain).toLowerCase();

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link
        href="/app/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Leads
      </Link>
      <ProspectDetail domain={decoded} />
    </div>
  );
}
