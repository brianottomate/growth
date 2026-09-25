import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { loadPerformanceTracker } from "@/server/services/performance-tracker.service";

import { TrackerTable } from "../TrackerTable";

export const metadata: Metadata = { title: "Tracker · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceTrackerPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const rows = await loadPerformanceTracker(org.id);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Tracker</h2>
        <Link
          href="/app/performance/accounts"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Billing
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      ) : (
        // Eighteen columns want the whole width, so the table escapes the
        // centered column the way the content Board does.
        <div className="mx-[calc(((100cqw-min(100cqw,64rem))/2+1rem)*-1)] @xl:mx-[calc(((100cqw-min(100cqw,64rem))/2+2rem)*-1)]">
          <TrackerTable rows={rows} />
        </div>
      )}
    </div>
  );
}
