import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { workspaceActor } from "@/server/workspace-actor";
import {
  loadPerformanceDesk,
  narrowDesk,
} from "@/server/services/performance-desk.service";
import { loadPortfolioEvidence } from "@/server/services/performance-portfolio.service";
import { BrandRowMenu } from "../BrandRowMenu";
import { SendLink } from "../SendLink";
import { ProspectActions } from "./ProspectActions";
import { ProspectSearch } from "./ProspectSearch";
import { ProspectPortfolio } from "./ProspectPortfolio";

export const metadata: Metadata = { title: "Prospects · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceProspectsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const actor = await workspaceActor();
  if (!actor)
    return (
      <div className="text-muted-foreground">
        Select an organization to view prospects.
      </div>
    );
  const all = await loadPerformanceDesk(actor.orgId);
  const desk = narrowDesk(all, "prospect");
  const evidence = await loadPortfolioEvidence(
    actor.orgId,
    all.brands.map((brand) => brand.id),
  );
  return (
    <div className="space-y-7 pt-1">
      <ProspectPortfolio
        rows={desk.brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          website: brand.website,
          logo: brand.logo,
          business: brand.business,
          delivery: brand.delivery,
          campaigns: brand.campaigns.length,
          ads: brand.campaigns.reduce(
            (sum, campaign) => sum + campaign.adCount,
            0,
          ),
          evidence: evidence.get(brand.id) ?? null,
          relatedAccounts: all.brands
            .filter(
              (other) =>
                other.id !== brand.id &&
                Boolean(evidence.get(brand.id)?.domain) &&
                evidence.get(other.id)?.domain ===
                  evidence.get(brand.id)?.domain,
            )
            .map((other) => ({
              id: other.id,
              name: other.name,
              slug: other.slug,
              business: other.business,
            })),
          actions: (
            <>
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
            </>
          ),
        }))}
      />
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 font-semibold">Add an account</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Search existing leads to start a Performance prospect.
        </p>
        <ProspectSearch
          prospectDomains={all.brands
            .map(
              (brand) =>
                evidence.get(brand.id)?.domain ??
                brand.website?.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
            )
            .filter((domain): domain is string => Boolean(domain))}
        />
      </section>
    </div>
  );
}
