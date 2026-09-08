import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExternalLink, Target } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { loadPerformanceDesk, narrowDesk } from "@/server/services/performance-desk.service";

import { brandAdsHref, BrandLogo, StateChip } from "../_components";
import { FindLeadDialog } from "./FindLeadDialog";
import { ProspectActions } from "./ProspectActions";

export const metadata: Metadata = { title: "Prospects · Wander Performance" };
export const dynamic = "force-dynamic";

/** The prospects, and the one way in: find a lead and make it one. */
export default async function PerformanceProspectsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "prospect");

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FindLeadDialog />
      </div>
      {desk.brands.length === 0 ? (
        <EmptyState icon={Target} title="No prospects" actions={<FindLeadDialog />} />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {desk.brands.map((brand) => (
            <li key={brand.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <BrandLogo brand={brand} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/brands/${brand.slug ?? brand.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {brand.name}
                  </Link>
                  {brand.best ? <StateChip state={brand.best} /> : null}
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[11px]">
                  {brand.website ? (
                    <a
                      href={brand.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {brand.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                  {brand.campaigns.length > 0 ? (
                    <Link href={brandAdsHref(brand)} className="hover:underline">
                      {brand.campaigns.length} campaign{brand.campaigns.length === 1 ? "" : "s"}
                    </Link>
                  ) : null}
                </div>
              </div>
              <ProspectActions brandId={brand.id} website={brand.website} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
