"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { plausibleWanderOsId } from "@/lib/wanderos-site-detection";
import type { DeskBrand } from "@/server/services/performance-desk.service";
import { brandAdsHref, BrandLogo } from "../_components";
import { BusinessChip } from "../StageChip";
import { BrandRowMenu } from "../BrandRowMenu";
import { SendLink } from "../SendLink";
import { PitchChatButton } from "../PitchChatButton";
import { SiteTag } from "../SiteTag";
import { HeaderNewClient } from "../HeaderNewClient";
import { PerformancePageHeader } from "../PageHeader";
import { ProspectSearch } from "./ProspectSearch";

/**
 * Prospects on the same frame as Clients: one row each, the row opens the
 * account, and the two links a rep sends sit on the right. The search box
 * doubles as the way in to new leads, which is why it stays on this page.
 */
export function ProspectDesk({
  prospects,
  existingDomains,
}: {
  prospects: DeskBrand[];
  existingDomains: string[];
}) {
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString
      .withDefault("")
      .withOptions({ history: "replace", shallow: true }),
  );
  const [legacyView, setLegacyView] = useQueryState("view", parseAsString);
  useEffect(() => {
    if (legacyView !== null) void setLegacyView(null);
  }, [legacyView, setLegacyView]);
  const term = query.trim().slice(0, 160);
  const [leadTerm, setLeadTerm] = useState(term);
  useEffect(() => {
    const timer = setTimeout(() => setLeadTerm(term), 350);
    return () => clearTimeout(timer);
  }, [term]);
  const brands = prospects.filter(
    (brand) =>
      !term ||
      [brand.name, brand.website].some((value) =>
        value?.toLowerCase().includes(term.toLowerCase()),
      ),
  );
  return (
    <div className="flex flex-col gap-6">
      <PerformancePageHeader
        title="Prospects"
        description="Companies we are pitching, and the search that finds the next one."
        action={<HeaderNewClient />}
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => void setQuery(event.target.value)}
            maxLength={160}
            autoFocus
            aria-label="Search company or website"
            placeholder="Search prospects, or paste a website to find a new one…"
            className="h-12 w-full rounded-xl border bg-background pr-28 pl-11 text-[15px] shadow-sm focus:ring-2 focus:ring-ring focus:outline-none"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
            {brands.length} {brands.length === 1 ? "prospect" : "prospects"}
          </span>
        </div>
      </PerformancePageHeader>
      <section className="space-y-2">
        {brands.length ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {brands.map((brand) => {
              const href = `/app/performance/clients/${brand.slug ?? brand.id}`;
              return (
                <li
                  key={brand.id}
                  className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <BrandLogo brand={brand} className="size-8 text-[11px]" />
                  <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] @3xl:basis-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={href}
                        className="text-[13px] font-semibold after:absolute after:inset-0 hover:underline"
                      >
                        {brand.name}
                      </Link>
                      <BusinessChip stage={brand.business} />
                      <Badge
                        variant={
                          plausibleWanderOsId(brand.wanderOsWebsiteId)
                            ? "secondary"
                            : "outline"
                        }
                        title="WanderOS website check"
                      >
                        {plausibleWanderOsId(brand.wanderOsWebsiteId)
                          ? "WanderOS"
                          : brand.wanderOsCheckedAt
                            ? "WanderOS · Not detected"
                            : "WanderOS · Not checked"}
                      </Badge>
                    </div>
                    <div className="relative z-10 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                      <SiteTag website={brand.website} />
                      {brand.campaigns.length > 0 ? (
                        <Link
                          href={brandAdsHref(brand)}
                          className="hover:underline"
                        >
                          {brand.campaigns.length} draft campaign
                          {brand.campaigns.length === 1 ? "" : "s"}
                        </Link>
                      ) : (
                        <span>Nothing started</span>
                      )}
                    </div>
                  </div>
                  <div className="relative z-10 flex w-full flex-wrap items-center gap-2 @3xl:w-auto">
                    {brand.pitchUrl ? (
                      <SendLink label="Pitch page" url={brand.pitchUrl} />
                    ) : null}
                    {brand.intakeUrl ? (
                      <SendLink label="Intake form" url={brand.intakeUrl} />
                    ) : null}
                    <PitchChatButton brandId={brand.id} name={brand.name} />
                    <BrandRowMenu
                      brandId={brand.id}
                      brandName={brand.name}
                      business={brand.business}
                      delivery={brand.delivery}
                      billing={brand.billing}
                      setupWebsite={brand.website}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {term ? "No matching prospects." : "No prospects yet."}
          </p>
        )}
      </section>
      {term.length >= 2 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline gap-2 px-1">
            <h2 className="text-[13px] font-semibold">Find new prospects</h2>
          </div>
          {term !== leadTerm ? (
            <p role="status" className="text-xs text-muted-foreground">
              Searching leads…
            </p>
          ) : (
            <ProspectSearch term={leadTerm} prospectDomains={existingDomains} />
          )}
        </section>
      )}
    </div>
  );
}
