"use client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChannelLogo } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";
import { selectPlatformAds } from "@/lib/platform-ad-plan";
import { orpc } from "@/orpc/client";
import type {
  Ad,
  DeliveryGeography,
  PlatformCampaign,
} from "@/server/db/ads-schema";

import { AskAssistantButton } from "./AskAssistantButton";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import { DeliveryTargetingSummary } from "./DeliveryTargetingSummary";
import { money } from "./format";
import { LinkedInSettings } from "./LinkedInSettings";
import { PlatformAdSelection } from "./PlatformAdSelection";
import { PushToPlatform } from "./PushToPlatform";

type Audience = {
  id: string;
  name: string;
  audienceId?: string | null;
  configuration?: DeliveryGroupConfiguration | null;
  geography?: DeliveryGeography | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

/**
 * The LinkedIn platform draft, laid out like the Meta and Google cards: the
 * settings the push will send, the blockers that stop it, and the ad sets
 * (LinkedIn campaigns) each audience becomes. LinkedIn targets at country
 * level only and pushes paused, like the others.
 */
export function LinkedInPlatformCard({
  pc,
  ads,
  audiences,
  campaignId,
  campaignName,
  brandSlug,
  brandName,
  campaignEndAt,
}: {
  pc: PlatformCampaign;
  ads: Ad[];
  audiences: Audience[];
  campaignId: string;
  campaignName: string;
  brandSlug: string;
  brandName: string;
  campaignEndAt?: Date | null;
}) {
  const pathname = usePathname();
  const studioHref = pathname.startsWith("/app/performance/")
    ? `/app/performance/clients/${encodeURIComponent(brandSlug)}/ads`
    : `/app/brands/${encodeURIComponent(brandSlug)}/ads`;
  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: "linkedin" },
    }),
  );
  const destinationRows = destinations.data?.destinations ?? [];
  const connectionError = destinations.data?.connectionErrors?.[0]?.message;
  const destination =
    destinationRows.length === 1 ? destinationRows[0] : undefined;
  const linkedin = pc.settings?.linkedin;
  const selected = selectPlatformAds(ads, "linkedin_ads", pc.settings ?? {});
  const approved = selected.filter((ad) => ad.status === "approved");
  const sets = audiences;
  const endAt = pc.endAt ?? campaignEndAt;
  const expiredToken = /expired|401/i.test(connectionError ?? "");
  const blockers = [
    destinations.isPending && "Loading the LinkedIn ad account.",
    expiredToken &&
      "The LinkedIn connection has expired. Reconnect it in Connections.",
    !expiredToken &&
      (destinations.error || connectionError) &&
      "Could not load the LinkedIn ad account.",
    !destinations.isPending &&
      !connectionError &&
      !destinations.error &&
      !destination &&
      (destinationRows.length
        ? "More than one LinkedIn ad account is allowlisted. Keep one for this brand."
        : "Allowlist a LinkedIn ad account for this brand in Connections."),
    !pc.budget && "Set a platform budget.",
    pc.budgetType === "lifetime" &&
      !endAt &&
      "A lifetime budget needs a flight end date.",
    !approved.length && "Add and approve at least one included ad.",
    !sets.length && "Add at least one audience.",
  ].filter((value): value is string => typeof value === "string");
  const countries = Array.from(
    new Set(sets.flatMap((set) => set.geography?.countries ?? [])),
  );
  return (
    <section
      id="platform-linkedin_ads"
      className="@container min-w-0 scroll-mt-4 space-y-5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="linkedin_ads" className="size-5" />
        <h3 className="font-semibold">LinkedIn Ads</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          Planned · paused on push
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <AskAssistantButton
            brandId={pc.brandId}
            brandName={brandName}
            campaignId={campaignId}
            campaignName={campaignName}
            focus="platforms"
            label="Shape"
            ask={`Help me shape the LinkedIn plan for “${campaignName}”. Read its ads, audiences and LinkedIn settings before changing anything.`}
          />
          {blockers.length ? (
            <span title={blockers.join("\n")}>
              <Button size="sm" disabled>
                Push to LinkedIn
              </Button>
            </span>
          ) : (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform="linkedin_ads"
              draftAdCount={approved.length}
              audienceCount={sets.length}
              budget={pc.budget}
              budgetType={pc.budgetType}
              configuration={
                destination
                  ? {
                      connectionAccountId: destination.connectionAccountId,
                      adAccountId: destination.adAccountId,
                      goal: "traffic",
                      label:
                        destination.adAccountName ?? destination.adAccountId,
                    }
                  : undefined
              }
            />
          )}
          <DeletePlatformCampaign
            platformCampaignId={pc.id}
            campaignName="LinkedIn Ads"
            brandSlug={brandSlug}
            isLive={false}
            spend={pc.spend}
            hasExternalId={Boolean(pc.externalId)}
            compact
            afterDelete="refresh"
          />
        </div>
      </div>
      <section className="space-y-3" aria-label="Delivery setup">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Delivery setup</h4>
          <LinkedInSettings platformCampaignId={pc.id} config={linkedin} />
        </div>
        <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-4">
          <Fact label="Goal" value="Traffic" />
          <Fact
            label="Budget"
            value={
              pc.budget
                ? `${money(pc.budget)}${pc.budgetType === "lifetime" ? " lifetime" : " / day"}`
                : "Not set"
            }
          />
          <Fact
            label="Ad account"
            value={
              destination
                ? `${destination.adAccountName ?? "LinkedIn Ads"} · ${destination.adAccountId}`
                : destinations.isPending
                  ? "Loading…"
                  : expiredToken
                    ? "Connection expired"
                    : "Not configured"
            }
          />
          <Fact
            label="Company Page"
            value={
              linkedin?.organizationId
                ? linkedin.organizationId.replace(/^urn:li:organization:/i, "")
                : "Inferred from the ad account"
            }
          />
          <Fact
            label="Bidding"
            value={
              linkedin?.costType
                ? `${linkedin.costType}${linkedin.unitCost ? ` · ${money(linkedin.unitCost)}` : ""}`
                : "Automated"
            }
          />
          <Fact
            label="Call to action"
            value={
              linkedin?.callToAction
                ? linkedin.callToAction.toLowerCase().replaceAll("_", " ")
                : "Learn more"
            }
          />
          <Fact
            label="Flight ends"
            value={
              endAt
                ? new Date(endAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })
                : "Runs until paused"
            }
          />
          <Fact
            label="Countries"
            value={countries.length ? countries.join(", ") : "Not set"}
          />
        </dl>
        {expiredToken && (
          <p className="text-xs text-muted-foreground">
            The LinkedIn token at Zernio has expired, so the ad account cannot
            be read. Reconnect it under{" "}
            <Link
              href={`/app/brands/${encodeURIComponent(brandSlug)}/setup`}
              className="underline underline-offset-2"
            >
              Connections
            </Link>{" "}
            before pushing.
          </p>
        )}
      </section>
      <PlatformAdSelection pc={pc} ads={ads} />
      {!approved.length && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Button size="sm" variant="outline" asChild>
            <Link href={studioHref}>Review drafts in Studio</Link>
          </Button>
          <p>Approve a creative in Studio, then add it to this campaign.</p>
        </div>
      )}
      <section
        className="space-y-3 border-t pt-4"
        aria-label="LinkedIn ad sets"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Ad sets · {sets.length}</h4>
        </div>
        {sets.length > 1 && (
          <p className="text-xs text-muted-foreground">
            The same creative selection is included in every ad set. LinkedIn
            targets by country here; job titles and company sizes are set in
            Campaign Manager after the push.
          </p>
        )}
        {sets.map((set) => (
          <div
            key={set.id}
            className="relative rounded-xl border bg-background"
          >
            <details className="group min-w-0 p-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 pr-20 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
                <h5 className="text-sm font-semibold">{set.name}</h5>
                <span className="text-xs text-muted-foreground">
                  {selected.length} {selected.length === 1 ? "ad" : "ads"}
                </span>
                <div className="w-full pl-7">
                  <DeliveryTargetingSummary compact audience={set} />
                </div>
              </summary>
              <div className="mt-4 space-y-2">
                {selected.map((ad) => (
                  <div key={ad.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 font-medium">
                      {ad.name}
                    </span>
                    {ad.status !== "approved" && (
                      <span className="shrink-0 text-muted-foreground">
                        Awaiting approval
                      </span>
                    )}
                  </div>
                ))}
                {!selected.length && (
                  <p className="text-sm text-muted-foreground">
                    No ads included in this ad set.
                  </p>
                )}
              </div>
            </details>
            <div className="absolute top-4 right-4">
              <DeliveryGroupEditor group={set} />
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold break-words">{value}</dd>
    </div>
  );
}
