"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { plausibleWanderOsId } from "@/lib/wanderos-site-detection";
import { cn } from "@/components/ui/lib/utils";
import type { DeskBrand } from "@/server/services/performance-desk.service";
import { brandAdsHref, BrandLogo, panel, SectionLabel } from "../_components";
import { StageChips } from "../StageChip";
import { BrandRowMenu } from "../BrandRowMenu";
import { SendLink } from "../SendLink";
import { PitchChatButton } from "../PitchChatButton";
import { SiteTag } from "../SiteTag";
import { HeaderNewClient } from "../HeaderNewClient";
import { ProspectSearch } from "./ProspectSearch";

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
    <div className="space-y-7 pt-1">
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(event) => void setQuery(event.target.value)}
          maxLength={160}
          autoFocus
          aria-label="Search company or website"
          placeholder="Search a company or paste their website…"
          className="min-h-10 min-w-0 flex-1 rounded-full border bg-muted/40 px-4 text-[13.5px]"
        />
        <HeaderNewClient />
      </div>
      <section className="space-y-2.5">
        <SectionLabel>
          {term ? "Your prospects" : "Current prospects"} · {brands.length}
        </SectionLabel>
        {brands.length ? (
          <ul className={cn(panel, "divide-y")}>
            {brands.map((brand) => (
              <li
                key={brand.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <BrandLogo brand={brand} className="size-8 text-[11px]" />
                <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] @3xl:basis-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/app/performance/clients/${brand.slug ?? brand.id}`}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {brand.name}
                    </Link>
                    <StageChips
                      business={brand.business}
                      delivery={brand.delivery}
                    />
                    <SiteTag website={brand.website} />
                    {plausibleWanderOsId(brand.wanderOsWebsiteId) && (
                      <Badge variant="secondary">WanderOS</Badge>
                    )}
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
                <div className="flex w-full flex-wrap items-center gap-3 @3xl:w-auto">
                  <Link
                    className="text-xs hover:underline"
                    href={`/app/performance/clients/${brand.slug ?? brand.id}/pitch`}
                  >
                    Open pitch
                  </Link>
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
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {term ? "No matching prospects." : "No prospects yet."}
          </p>
        )}
      </section>
      {term.length >= 2 && (
        <section className="space-y-2.5">
          <SectionLabel>Find new prospects</SectionLabel>
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
