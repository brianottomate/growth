import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { getDraftInitiative } from "@/server/services/ads-draft.service";

import { AddAdButton } from "../../[platformCampaignId]/AddAdButton";
import { AdSets } from "./AdSets";
import { CreativePool } from "./CreativePool";
import { GoogleSettings } from "./GoogleSettings";
import { PushToPlatform } from "../../[platformCampaignId]/PushToPlatform";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString()}`;

/**
 * The campaign draft: the first-party object you author. Mostly read-only —
 * editing happens in chat; the dialogs here are utilities for the basics.
 * Per-platform campaigns don't exist yet; the push creates them.
 */
export default async function CampaignDraftPage({
  params,
}: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
}) {
  const { brandSlug, campaignId } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const draft = await getDraftInitiative(org.id, campaignId).catch(
    () => null,
  );
  if (draft?.brand.slug !== brandSlug) notFound();

  const { initiative, adSets, spots, campaigns, audienceTargets } = draft;
  const targets = initiative.targetChannels ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Link href="/app/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}`} className="hover:underline">
            {brandSlug}
          </Link>
          <span>/</span>
          <Link
            href={`/app/brands/${brandSlug}/ads`}
            className="hover:underline"
          >
            Ads
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {initiative.name}
              </h1>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                draft
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <span>Planned for</span>
              {targets.map((platform) => (
                <span key={platform} className="flex items-center gap-1">
                  <ChannelLogo platform={platform} className="size-4" />
                  {platformLabel(platform)}
                </span>
              ))}
              {initiative.landingUrl && (
                <span className="truncate">· {initiative.landingUrl}</span>
              )}
            </p>
            {initiative.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                {initiative.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AddAdButton
              campaignId={initiative.id}
              brandId={draft.brand.id}
              inheritedLinkUrl={initiative.landingUrl}
            />
            {spots.length > 0 &&
              (targets.length > 0 ? targets : ["meta_ads"]).map((target) => (
                <PushToPlatform
                  key={target}
                  campaignId={initiative.id}
                  brandSlug={brandSlug}
                  spotCount={spots.length}
                  defaultBudget={initiative.budget}
                  platform={target as "meta_ads" | "google_ads"}
                  adSetCount={adSets.length}
                />
              ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Budget</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {money(initiative.budget)}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Ad sets</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {adSets.length}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Ads</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {spots.length}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Live campaigns</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {campaigns.length}
          </p>
        </div>
      </div>

      {campaigns.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">On the platforms</h2>
          <div className="space-y-2">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/app/brands/${brandSlug}/ads/${campaign.id}`}
                className="bg-card flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-white/20"
              >
                <ChannelLogo platform={campaign.platform} className="size-5" />
                <span className="flex-1 truncate text-sm font-medium">
                  {campaign.name}
                </span>
                <span className="text-muted-foreground text-xs capitalize">
                  {campaign.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CreativePool
        campaignId={initiative.id}
        brandId={draft.brand.id}
        pool={initiative.creativePool ?? []}
      />

      {targets.includes("google_ads") && (
        <GoogleSettings
          campaignId={initiative.id}
          config={initiative.platformConfig?.google}
        />
      )}

      <AdSets
        campaignId={initiative.id}
        brandId={draft.brand.id}
        adSets={adSets}
        audienceTargets={audienceTargets}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Ads{" "}
          <span className="text-muted-foreground text-sm font-normal">
            {spots.length}
          </span>
        </h2>
        {spots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No ads yet. Add one from the brand&apos;s{" "}
            <Link href="/app/media" className="underline">
              media library
            </Link>
            , make something in{" "}
            <Link href="/app/studio" className="underline">
              the studio
            </Link>
            , or draft them in chat.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spots.map((spot) => (
              <div
                key={spot.id}
                className="bg-card overflow-hidden rounded-xl border"
              >
                <div className="bg-muted relative aspect-video">
                  {(spot.media?.[0]?.url ?? spot.thumbnailUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={spot.media?.[0]?.url ?? spot.thumbnailUrl ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {spot.externalId ? "live" : "drafted"}
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">
                    {spot.name ?? "Untitled ad"}
                  </p>
                  {spot.headline && (
                    <p className="truncate text-xs font-medium">
                      {spot.headline}
                    </p>
                  )}
                  {spot.body && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {spot.body}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
