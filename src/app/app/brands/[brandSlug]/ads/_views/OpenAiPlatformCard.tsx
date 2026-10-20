"use client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChannelLogo } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import {
  OPENAI_CHAT_CARD_KEY,
  placementSpec,
  resolveCell,
} from "@/lib/ad-placements";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";
import { selectPlatformAds } from "@/lib/platform-ad-plan";
import { openAiBiddingRequirement } from "@/lib/zernio-ads";
import { orpc } from "@/orpc/client";
import type {
  Ad,
  AdCreativeContent,
  DeliveryGeography,
  PlatformCampaign,
} from "@/server/db/ads-schema";

import { AskAssistantButton } from "./AskAssistantButton";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import { DeliveryTargetingSummary } from "./DeliveryTargetingSummary";
import { money } from "./format";
import { OpenAiSettings } from "./OpenAiSettings";
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
 * The OpenAI platform draft, laid out like the Meta, Google and LinkedIn
 * cards: the settings the push will send, the blockers that stop it, and the
 * one ad group this row compiles to. ChatGPT ads are chat cards, and Zernio
 * builds one per campaign with no attach, so the card holds exactly one ad
 * and one audience; the copy it sends is the ad's ChatGPT placement cell.
 */
export function OpenAiPlatformCard({
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
      input: { brandSlug, platform: "openai" },
    }),
  );
  const destinationRows = destinations.data?.destinations ?? [];
  const connectionError = destinations.data?.connectionErrors?.[0]?.message;
  const destination =
    destinationRows.length === 1 ? destinationRows[0] : undefined;
  const openai = pc.settings?.openai;
  const goal = openai?.goal ?? "traffic";
  const selected = selectPlatformAds(ads, "openai_ads", pc.settings ?? {});
  const approved = selected.filter((ad) => ad.status === "approved");
  const sets = audiences;
  const endAt = pc.endAt ?? campaignEndAt;
  const spec = placementSpec(OPENAI_CHAT_CARD_KEY)!;
  const cards = approved.map((ad) => ({
    ad,
    cell: resolveCell(
      { content: ad.content as AdCreativeContent, placements: ad.placements },
      spec,
    ),
  }));
  const unfit = cards.filter(({ cell }) => !cell.fit.ok);
  const countries = Array.from(
    new Set(sets.flatMap((set) => set.geography?.countries ?? [])),
  );
  const biddingIssue = openAiBiddingRequirement({
    goal,
    budgetType: pc.budgetType === "lifetime" ? "lifetime" : "daily",
    bidStrategy: openai?.bidStrategy,
    bidAmount: openai?.bidAmount,
  });
  const blockers = [
    destinations.isPending && "Loading the OpenAI ad account.",
    (destinations.error || connectionError) &&
      "Could not load the OpenAI ad account.",
    !destinations.isPending &&
      !connectionError &&
      !destinations.error &&
      !destination &&
      (destinationRows.length
        ? "More than one OpenAI ad account is allowlisted. Keep one for this brand."
        : "Allowlist the OpenAI ad account for this brand in Connections."),
    !pc.budget && "Set a platform budget.",
    pc.budgetType === "lifetime" &&
      !endAt &&
      "A lifetime budget needs a flight end date.",
    !approved.length && "Add and approve one included ad.",
    approved.length > 1 &&
      "OpenAI takes one chat card per campaign. Keep one ad in the selection.",
    !sets.length && "Add one audience.",
    sets.length > 1 &&
      "OpenAI takes one ad group per campaign. Keep one audience here.",
    !countries.length && "Set the audience's countries.",
    unfit.length > 0 &&
      `ChatGPT copy over its limits on ${unfit.map(({ ad }) => ad.name).join(", ")}: override the ChatGPT placement copy.`,
    biddingIssue && `${biddingIssue}.`,
    goal === "conversions" &&
      !openai?.customEventType &&
      "A conversions campaign needs the tracking tag's event in OpenAI settings.",
  ].filter((value): value is string => typeof value === "string");
  return (
    <section
      id="platform-openai_ads"
      className="@container min-w-0 scroll-mt-4 space-y-5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="openai_ads" className="size-5" />
        <h3 className="font-semibold">OpenAI Ads</h3>
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
            ask={`Help me shape the OpenAI plan for “${campaignName}”. Read its ads, audiences and OpenAI settings before changing anything; the chat card copy lives on the openai_ads:chat_card placement.`}
          />
          {blockers.length ? (
            <span title={blockers.join("\n")}>
              <Button size="sm" disabled>
                Push to OpenAI
              </Button>
            </span>
          ) : (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform="openai_ads"
              draftAdCount={approved.length}
              audienceCount={sets.length}
              budget={pc.budget}
              budgetType={pc.budgetType}
              configuration={
                destination
                  ? {
                      connectionAccountId: destination.connectionAccountId,
                      adAccountId: destination.adAccountId,
                      goal,
                      label:
                        destination.adAccountName ?? destination.adAccountId,
                    }
                  : undefined
              }
            />
          )}
          <DeletePlatformCampaign
            platformCampaignId={pc.id}
            campaignName="OpenAI Ads"
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
          <OpenAiSettings
            platformCampaignId={pc.id}
            budgetType={pc.budgetType}
            config={openai}
          />
        </div>
        <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-4">
          <Fact label="Goal" value={goal} />
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
                ? `${destination.adAccountName ?? "OpenAI Ads"} · ${destination.adAccountId}`
                : destinations.isPending
                  ? "Loading…"
                  : "Not configured"
            }
          />
          <Fact
            label="Bidding"
            value={
              openai?.bidStrategy
                ? `${openai.bidStrategy.toLowerCase().replaceAll("_", " ")}${openai.bidAmount ? ` · ${money(openai.bidAmount)}` : ""}`
                : "Maximize Results"
            }
          />
          <Fact
            label="Conversion event"
            value={
              goal === "conversions"
                ? (openai?.customEventType ?? "Not set")
                : "Not used"
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
          <Fact label="Format" value="Static chat card" />
        </dl>
        {connectionError && (
          <p className="text-xs text-muted-foreground">
            The OpenAI connection at Zernio could not be read: {connectionError}
            . Check it under{" "}
            <Link
              href={`/app/brands/${encodeURIComponent(brandSlug)}/setup`}
              className="underline underline-offset-2"
            >
              Connections
            </Link>
            .
          </p>
        )}
      </section>
      <PlatformAdSelection pc={pc} ads={ads} />
      {cards.length > 0 && (
        <section className="space-y-2" aria-label="Chat card copy">
          <h4 className="text-sm font-medium">Chat card copy</h4>
          {cards.map(({ ad, cell }) => (
            <div
              key={ad.id}
              className="space-y-1 rounded-lg border bg-background p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ad.name}</span>
                <span className="text-muted-foreground">
                  Title {cell.copy.headline.length}/{spec.copy.headlineMax} ·
                  Body {cell.copy.body.length}/{spec.copy.bodyMax}
                </span>
                {!cell.fit.ok && (
                  <span className="text-amber-400">
                    {cell.fit.issues.join(" · ")}
                  </span>
                )}
              </div>
              <p className="font-semibold">{cell.copy.headline}</p>
              <p className="text-muted-foreground">{cell.copy.body}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Override the ChatGPT placement copy on the ad to fit the limits; the
            base feed copy stays as it is.
          </p>
        </section>
      )}
      {!approved.length && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Button size="sm" variant="outline" asChild>
            <Link href={studioHref}>Review drafts in Studio</Link>
          </Button>
          <p>
            Approve a single-image creative in Studio, then include it here.
          </p>
        </div>
      )}
      <section className="space-y-3 border-t pt-4" aria-label="OpenAI ad group">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Ad group · {sets.length}</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          OpenAI targets by country only; lists, lookalikes, ages and regions
          are left out of the push.
        </p>
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
                    No ads included in this ad group.
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
