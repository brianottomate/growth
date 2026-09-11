import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { launchSurfaceLabels, launchTierGuidance } from "@/lib/launch";
import { db } from "@/server/db";
import { memberTable, productTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { listLaunches } from "@/server/services/launch.service";

import { NewLaunchDialog } from "./NewLaunchDialog";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-sky-500/15 text-sky-300",
  shipped: "bg-emerald-500/15 text-emerald-300",
  retro: "bg-muted text-muted-foreground",
};

function dayLabel(date: string | null) {
  if (!date) return "No date";
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export default async function LaunchesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
  });
  if (!membership?.organizationId) redirect("/app");

  const [launches, products] = await Promise.all([
    listLaunches(membership.organizationId),
    db.query.productTable.findMany({
      where: and(
        eq(productTable.organizationId, membership.organizationId),
        isNull(productTable.deletedAt),
      ),
      columns: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Launches</h1>
        <NewLaunchDialog products={products} />
      </div>

      {launches.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {products.length === 0
            ? "Add a product in Product Atlas first."
            : "Create a launch to give a ship date its owners and drafts."}
        </p>
      ) : (
        <ul className="space-y-2">
          {launches.map((launch) => (
            <li key={launch.id}>
              <Link
                href={`/app/launches/${launch.id}`}
                className="hover:border-foreground/20 bg-card block rounded-lg border px-4 py-3 transition-all duration-200 hover:-translate-y-px hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{launch.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[launch.status] ?? "bg-muted"}`}
                  >
                    {launch.status}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Tier {launch.tier}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {dayLabel(launch.targetDate)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {launch.productName ?? "No product"}
                  {launch.ownerName ? ` · ${launch.ownerName}` : ""}
                  {` · ${launch.ready}/${launch.total} ready`}
                  {launch.releaseTheme ? ` · ${launch.releaseTheme}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="text-muted-foreground border-t pt-4 text-xs">
        {Object.values(launchTierGuidance).map((tier) => (
          <p key={tier.label}>
            {tier.label} · {tier.leadTime} ·{" "}
            {tier.surfaces.map((s) => launchSurfaceLabels[s]).join(", ")}
          </p>
        ))}
      </div>
    </div>
  );
}
