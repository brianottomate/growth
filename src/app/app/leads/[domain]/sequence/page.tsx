import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SequencePresentation } from "./SequencePresentation";

/**
 * The sequence for one prospect, as something to show a person.
 *
 * Its own route rather than a tab on the review page: the review page defaults
 * to the send decision, and merging the two would mean choosing one default for
 * both audiences — the same product call that keeps /leads and
 * /leads/send-review separate. A distinct URL is also what makes it linkable in
 * Slack.
 */
export default async function SequencePage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const decoded = decodeURIComponent(domain).toLowerCase();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link
        href={`/app/leads/${encodeURIComponent(decoded)}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {decoded}
      </Link>
      <SequencePresentation domain={decoded} />
    </div>
  );
}
