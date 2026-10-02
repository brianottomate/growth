"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { ButtonLink } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AudiencePanel, CampaignPanel, LaunchBrief } from "../LaunchPanels";
import { CreativePanel } from "../CreativePanel";
import { CatalogPanel } from "./CatalogPanel";

import type { WorkspaceData } from "../launch-workspace";

const LIVE_TONE: Record<string, string> = {
  live: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  ads_review: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  paused: "border-zinc-500/30 bg-zinc-500/10 text-muted-foreground",
};

const TABS = ["brief", "creative", "audience", "campaign", "catalog"] as const;

export function ClientWorkspace({ data }: { data: WorkspaceData }) {
  const { brand } = data;
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("brief"),
  );
  const initials = brand.name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const tone = LIVE_TONE[brand.delivery] ?? "border-border bg-muted";

  return (
    <section className="min-w-0 space-y-5">
      <Link
        href="/app/performance/prototype"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All brands
      </Link>

      <header className="flex flex-col justify-between gap-4 @xl:flex-row @xl:items-center">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            {brand.avatarUrl ? (
              <>
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={brand.avatarUrl}
                  alt=""
                  className="size-full object-contain p-1"
                />
              </>
            ) : (
              <span className="font-semibold">{initials}</span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {brand.name}
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
              >
                {brand.deliveryLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[data.marketCity, `${data.homes.length} homes on the feed`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {brand.website ? (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Their site <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
          <ButtonLink
            href={`/app/performance/brands/${brand.slug}/ads`}
            size="sm"
          >
            Open in the real Ads desk
          </ButtonLink>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => void setTab(v as (typeof TABS)[number])}
        className="min-w-0"
      >
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="brief">Launch brief</TabsTrigger>
            <TabsTrigger value="creative">
              Properties &amp; creative
            </TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="campaign">Campaign build</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="brief">
          <LaunchBrief data={data} />
        </TabsContent>
        <TabsContent value="creative">
          <CreativePanel brandId={brand.id} homes={data.homes} />
        </TabsContent>
        <TabsContent value="audience">
          <AudiencePanel brand={data.brand} />
        </TabsContent>
        <TabsContent value="campaign">
          <CampaignPanel
            campaigns={data.campaigns}
            adCount={data.campaigns.reduce(
              (sum, campaign) => sum + campaign.adCount,
              0,
            )}
          />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogPanel brandId={brand.id} homes={data.homes} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
