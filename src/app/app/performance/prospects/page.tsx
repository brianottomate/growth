import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { cn } from "@/components/ui/lib/utils";
import {
  loadPerformanceDesk,
  narrowDesk,
} from "@/server/services/performance-desk.service";

import { brandAdsHref, BrandLogo, panel, SectionLabel } from "../_components";
import { StageChips } from "../StageChip";
import { BrandRowMenu } from "../BrandRowMenu";
import { SendLink } from "../SendLink";
import { ProspectActions } from "./ProspectActions";
import { ProspectSearch } from "./ProspectSearch";

export const metadata: Metadata = { title: "Prospects · Wander Performance" };
export const dynamic = "force-dynamic";

const host = (url: string | null) =>
  url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null;

/** A narrow, quiet page: a search box, and the prospects under it. */
export default async function PerformanceProspectsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "prospect");

  return (
    <div className="space-y-7 pt-1">
      <ProspectSearch
        prospectDomains={desk.brands
          .map((brand) => host(brand.website))
          .filter((d): d is string => Boolean(d))}
      />

      {desk.brands.length > 0 ? (
        <section className="space-y-2.5">
          <SectionLabel>Current prospects · {desk.brands.length}</SectionLabel>
          <ul className={cn(panel, "divide-y")}>
            {desk.brands.map((brand) => (
              <li
                key={brand.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <BrandLogo brand={brand} className="size-8 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/app/performance/brands/${brand.slug ?? brand.id}`}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {brand.name}
                    </Link>
                    <StageChips
                      business={brand.business}
                      delivery={brand.delivery}
                    />
                    {brand.website ? (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11.5px] text-muted-foreground hover:underline"
                      >
                        {host(brand.website)}
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {brand.campaigns.length > 0 ? (
                      <Link
                        href={brandAdsHref(brand)}
                        className="hover:underline"
                      >
                        {brand.campaigns.length} draft campaign
                        {brand.campaigns.length === 1 ? "" : "s"}
                      </Link>
                    ) : (
                      <span>nothing started</span>
                    )}
                  </div>
                </div>
                <Link
                  className="text-xs hover:underline"
                  href={`/app/performance/brands/${brand.slug ?? brand.id}/pitch`}
                >
                  Edit pitch
                </Link>
                {brand.pitchUrl ? (
                  <SendLink label="Pitch page" url={brand.pitchUrl} />
                ) : null}
                {brand.intakeUrl ? (
                  <SendLink label="Intake form" url={brand.intakeUrl} />
                ) : null}
                <ProspectActions website={brand.website} />
                <BrandRowMenu
                  brandId={brand.id}
                  brandName={brand.name}
                  business={brand.business}
                  delivery={brand.delivery}
                  billing={brand.billing}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          No prospects yet.
        </p>
      )}
    </div>
  );
}
