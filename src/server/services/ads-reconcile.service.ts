import { GrowthActionError } from "@/server/ai/kernel/errors";
import { metaTrackingDefaults } from "./meta-tracking-defaults";
import {
  metaAdSetAdditionControls,
  metaGoalMatchesObjective,
} from "@/lib/meta-additions";
import { syncZernioAds } from "./ads-sync.service";
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  adTable,
  audienceTable,
  platformAdTable,
  platformCampaignTable,
  platformDeliveryGroupTable,
  campaignAudienceAssetTable,
  platformAudienceTable,
  adAccountTable,
} from "@/server/db/schema";
import { selectPlatformAds, adGoneOnPlatform } from "@/lib/platform-ad-plan";
import {
  deliveryGroupConfigurationSchema,
  hasDeliveryLocations,
} from "@/lib/platform-delivery";
import { platformCampaignAdAccount } from "@/lib/platform-campaign-account";
import { sameAdAccountId, metaDraftProviderControls } from "@/lib/zernio-ads";
import { metaProviderPlacements } from "@/lib/meta-placement-plan";
import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import { configuredMetaDestination } from "./ads-write.service";
import { requireOwnedCampaign } from "./ads-draft.service";
import { freezeApprovedAd } from "./ad-approval.service";
import {
  requireAdDestination,
  compileMetaAds,
  compileAudienceTargeting,
  createMetaAd,
  platformAdValues,
  sendAdToExistingMetaSet,
  type AdsWriteContext,
  type CompiledDeliveryAudience,
} from "./ads-write.service";
import { ensureMetaAdsPaused } from "@/server/clients/meta.client";
import {
  getZernioMetaCampaign,
  getZernioMetaDeliverySet,
  writtenAdId,
  writtenAdSetId,
  type CreateZernioStandaloneAdInput,
} from "@/server/clients/zernio.client";
import {
  startWorkflowRun,
  claimWorkflowRun,
  updateWorkflowRun,
  failWorkflowRun,
} from "./workflow-run.service";

/** A delivery review reads live ownership/status; it never changes Meta. */
async function prepare(input: {
  deliveryGroupId: string;
  organizationId: string;
}) {
  const group = await db.query.platformDeliveryGroupTable.findFirst({
    where: eq(platformDeliveryGroupTable.id, input.deliveryGroupId),
  });
  if (!group)
    throw new GrowthActionError(
      "not_found",
      "This ad set draft no longer exists. Refresh the campaign to see its current ad sets.",
    );
  const plan = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, group.platformCampaignId),
  });
  if (!plan?.campaignId)
    throw new GrowthActionError(
      "not_found",
      "Campaign plan not found for this ad set",
    );
  const { campaign } = await requireOwnedCampaign(
    plan.campaignId,
    input.organizationId,
  );
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
  });
  if (
    !brand ||
    brand.organizationId !== input.organizationId ||
    brand.deletedAt ||
    campaign.deletedAt
  )
    throw new Error("Campaign not found in this workspace");
  if (group.brandId !== brand.id || plan.brandId !== brand.id)
    throw new Error("Delivery group belongs to another brand");
  if (plan.platform !== "meta_ads" || !plan.externalId || !brand.slug)
    throw new Error("Choose an existing Meta campaign");
  const pinned = configuredMetaDestination(brand.performanceSettings);
  const recordedAccount = platformCampaignAdAccount(plan);
  if (
    !recordedAccount ||
    !sameAdAccountId("meta", recordedAccount, pinned.adAccountId)
  )
    throw new Error(
      "This campaign belongs to a different ad account than the configured destination",
    );
  const destination = await requireAdDestination({
    organizationId: input.organizationId,
    brandSlug: brand.slug,
    platform: "meta",
    ...pinned,
  });
  const { campaign: live } = await getZernioMetaCampaign({
    accountId: pinned.connectionAccountId,
    campaignId: plan.externalId,
  });
  if (
    !live?.id ||
    live.id !== plan.externalId ||
    !sameAdAccountId("meta", live.account_id, destination.adAccount.id)
  )
    throw new Error("Meta campaign ownership could not be verified");
  const trackingDefaults = await metaTrackingDefaults(
    brand.id,
    destination.adAccount.id,
  );
  const blockers: string[] = [];
  if (
    !metaGoalMatchesObjective(
      plan.settings?.meta?.goal ?? "conversions",
      live.objective,
    )
  )
    blockers.push(
      "The saved goal differs from the live Meta campaign objective. Review its delivery setup before adding ads.",
    );
  if (!["ACTIVE", "PAUSED"].includes(live.status))
    blockers.push(
      `Meta campaign is ${live.status}; it cannot accept additions.`,
    );
  if (plan.status === "ended" || campaign.status === "archived")
    blockers.push("This campaign is ended or archived.");
  const configuration =
    group.configuration == null
      ? null
      : deliveryGroupConfigurationSchema.parse(group.configuration);
  if (configuration && configuration.platform !== "meta_ads")
    throw new Error("This is not a Meta delivery group");
  const audience = group.audienceId
    ? await db.query.audienceTable.findFirst({
        where: eq(audienceTable.id, group.audienceId),
      })
    : null;
  if (
    group.audienceId &&
    (audience?.campaignId !== campaign.id || audience.brandId !== brand.id)
  )
    throw new Error("Audience belongs to another campaign");
  const link =
    audience &&
    (await db
      .select({ asset: platformAudienceTable, account: adAccountTable })
      .from(campaignAudienceAssetTable)
      .innerJoin(
        platformAudienceTable,
        eq(
          platformAudienceTable.id,
          campaignAudienceAssetTable.platformAudienceId,
        ),
      )
      .leftJoin(
        adAccountTable,
        eq(adAccountTable.id, platformAudienceTable.adAccountId),
      )
      .where(
        and(
          eq(campaignAudienceAssetTable.audienceId, audience.id),
          eq(campaignAudienceAssetTable.platform, "meta_ads"),
        ),
      )
      .limit(1));
  const asset = link?.[0];
  if (
    asset &&
    (asset.asset.brandId !== brand.id ||
      !asset.account ||
      !sameAdAccountId(
        "meta",
        asset.account.externalId,
        destination.adAccount.id,
      ) ||
      !asset.asset.externalId ||
      (asset.asset.seedMetadata && asset.asset.seedMetadata.status !== "ready"))
  )
    blockers.push("The linked audience is not ready in this ad account.");
  if (
    audience?.type === "lookalike" &&
    asset &&
    asset.asset.type !== "lookalike"
  )
    blockers.push("Link a lookalike audience, not its customer-list seed.");
  if (
    !group.externalId &&
    ["lookalike", "custom"].includes(audience?.type ?? "") &&
    !asset
  )
    blockers.push(
      "Link required: select a ready Meta audience in this ad account. This ad set will not publish as Broad.",
    );
  if (
    !group.externalId &&
    !hasDeliveryLocations(configuration?.targeting?.geography)
  )
    blockers.push("Set the new ad set’s locations before publishing.");
  const cbo = Boolean(
    Number(live.daily_budget) > 0 || Number(live.lifetime_budget) > 0,
  );
  if (
    !group.externalId &&
    !cbo &&
    (!group.budget || !["daily", "lifetime"].includes(group.budgetType ?? ""))
  )
    blockers.push(
      "This live campaign uses ad set budgets. Set an explicit budget on the new ad set.",
    );
  const liveGroup = group.externalId
    ? (
        await getZernioMetaDeliverySet({
          accountId: pinned.connectionAccountId,
          adSetId: group.externalId,
        })
      ).adSet
    : null;
  if (
    group.externalId &&
    (!liveGroup ||
      liveGroup.id !== group.externalId ||
      liveGroup.campaign_id !== plan.externalId ||
      !sameAdAccountId("meta", liveGroup.account_id, destination.adAccount.id))
  )
    throw new Error("Meta ad set ownership could not be verified");
  if (liveGroup && !["ACTIVE", "PAUSED"].includes(liveGroup.status))
    blockers.push(
      `Meta ad set is ${liveGroup.status}; choose an active or paused set.`,
    );
  const ads = selectPlatformAds(
    await db.query.adTable.findMany({
      where: eq(adTable.campaignId, campaign.id),
    }),
    "meta_ads",
    plan.settings ?? {},
  )
    .filter((a) => a.status === "approved")
    .sort((a, b) => a.id.localeCompare(b.id));
  const copies = await db.query.platformAdTable.findMany({
    where: eq(platformAdTable.platformDeliveryGroupId, group.id),
  });
  const liveAds = liveGroup?.ads;
  if (liveGroup && !liveAds)
    blockers.push(
      "Refresh Meta: the complete live ad list could not be verified for this ad set.",
    );
  if (liveAds?.paging?.next)
    blockers.push(
      "This ad set has more than 100 live ads. Review it in Meta before publishing additions.",
    );
  if (
    liveAds?.data.some(
      (a) =>
        !adGoneOnPlatform(a.status) &&
        !copies.some((c) => c.externalId === a.id),
    )
  )
    blockers.push(
      "Refresh Meta before reviewing: this ad set contains ads not yet mirrored in Growth.",
    );
  const present = new Set(
    copies
      .filter((a) => !adGoneOnPlatform(a.status))
      .flatMap((a) => (a.adId ? [a.adId] : [])),
  );
  // An unmatched ad imported from Meta may be the same creative. Never silently duplicate it.
  if (copies.some((a) => !a.adId && !adGoneOnPlatform(a.status)))
    blockers.push(
      "Some Meta ads in this set are not linked to Studio. Adopt/link them before publishing additions.",
    );
  const missing = ads.filter((a) => !present.has(a.id));
  if (missing.some((ad) => !ad.approvedBy))
    blockers.push(
      "Approve the imported ads in Studio before publishing them into another ad set.",
    );
  if (!missing.length)
    blockers.push("No approved ads are missing from this ad set.");
  if (missing.some((a) => a.type !== "creative" || !("media" in a.content)))
    blockers.push("Only creative Meta ads can be added.");
  const reviewToken = createHash("sha256")
    .update(
      JSON.stringify({
        campaign: plan.externalId,
        account: destination.adAccount.id,
        settings: plan.settings,
        trackingDefaults,
        pageId: brand.metaPageId,
        landingUrl: campaign.landingUrl,
        liveObjective: live.objective,
        group: {
          id: group.id,
          externalId: group.externalId,
          configuration,
          audienceId: group.audienceId,
          budget: group.budget,
          budgetType: group.budgetType,
        },
        asset: asset?.asset,
        ads: missing.map((a) => ({
          id: a.id,
          content: a.content,
          placements: a.placements,
        })),
        liveBudget: [live.daily_budget, live.lifetime_budget],
        liveStatus: live.status,
        liveGroup,
      }),
    )
    .digest("hex");
  return {
    group,
    plan,
    brand,
    campaign,
    pinned,
    destination,
    configuration,
    audience,
    missing,
    cbo,
    blockers,
    reviewToken,
  };
}
export async function previewMetaAdditions(input: {
  deliveryGroupId: string;
  organizationId: string;
}) {
  const p = await prepare(input);
  return {
    deliveryGroupId: p.group.id,
    platformCampaignId: p.plan.id,
    campaignName: p.campaign.name,
    groupName: p.group.name,
    createsAdSet: !p.group.externalId,
    ads: p.missing.map((a) => ({ id: a.id, name: a.name })),
    blockers: p.blockers,
    reviewToken: p.reviewToken,
  };
}

/** Only additive, reviewed operations. No campaign rewrite, activation or budget change. */
export async function publishMetaAdditions(
  input: { deliveryGroupId: string; reviewToken: string },
  context: AdsWriteContext,
) {
  let p = await prepare({ ...input, organizationId: context.organizationId });
  if (p.blockers.length) throw new Error(p.blockers.join(" "));
  if (input.reviewToken !== p.reviewToken)
    throw new Error(
      "The delivery review changed. Review the current additions before publishing.",
    );
  const started = await startWorkflowRun({
    organizationId: context.organizationId,
    brandId: p.brand.id,
    campaignId: p.campaign.id,
    workflowType: "platform-push",
    lockKey: `platform-push:${p.campaign.id}:meta_ads`,
    input: { ...input },
    progress: { message: "Preparing reviewed Meta additions" },
  });
  if (!started.started)
    throw new Error(
      "A Meta publish is already running for this campaign. Follow it in Background work.",
    );
  const run = await claimWorkflowRun(started.run.id, "platform-push");
  if (!run) throw new Error("Could not start Meta additions");
  const made: string[] = [];
  try {
    p = await prepare({ ...input, organizationId: context.organizationId });
    if (p.blockers.length || p.reviewToken !== input.reviewToken)
      throw new Error(
        "The delivery review changed. Review it again before publishing.",
      );
    // Validate all selected creative before the first provider write.
    for (const ad of p.missing) await freezeApprovedAd(ad.id);
    const freshAds = await db.query.adTable.findMany({
      where: eq(adTable.campaignId, p.campaign.id),
    });
    const usable = p.missing
      .map((a) => freshAds.find((f) => f.id === a.id)!)
      .map((ad) => {
        if (
          ad?.status !== "approved" ||
          !ad.approvedBy ||
          !("media" in ad.content)
        )
          throw new Error("All reviewed ads must remain approved creative ads");
        return { ad, content: ad.content };
      });
    const goal = p.plan.settings?.meta?.goal ?? "conversions";
    const warnings: string[] = [];
    const compiled = await compileMetaAds({
      goal,
      brand: p.brand,
      campaign: p.campaign,
      draft: p.plan,
      destination: p.destination,
      settings: {
        ...p.plan.settings,
        meta: {
          ...p.plan.settings?.meta,
          ...(p.configuration?.placements
            ? { placements: p.configuration.placements }
            : {}),
        },
      },
      usable,
      warnings,
    });
    if (!p.group.externalId) {
      if (!p.configuration)
        throw new Error("Configure the new ad set before publishing");
      const target = p.configuration.targeting;
      const audience: CompiledDeliveryAudience = {
        type: p.audience?.type ?? "segment",
        id: p.audience?.id ?? p.group.id,
        deliveryGroupId: p.group.id,
        name: p.group.name,
        personaId: p.audience?.personaId ?? null,
        geography: target?.geography ?? null,
        ageMin: target?.ageMin ?? null,
        ageMax: target?.ageMax ?? null,
        keywords: null,
        excludedKeywords: null,
      };
      const { spec } = await compileAudienceTargeting({
        audience,
        connectionAccountId: p.pinned.connectionAccountId,
        brandId: p.brand.id,
        platform: "meta_ads",
        adAccountId: p.destination.adAccount.id,
      });
      const meta = p.plan.settings?.meta;
      const schedule = resolveMetaSchedule({
        startAt: p.plan.startAt,
        endAt: p.plan.endAt,
        campaignStartAt: p.campaign.startAt,
        campaignEndAt: p.campaign.endAt,
        ...meta,
      });
      const budgetType =
        p.group.budgetType === "lifetime" ? "lifetime" : "daily";
      const issue = metaScheduleIssue(schedule, p.cbo ? "daily" : budgetType);
      if (issue) throw new Error(issue);
      const first = usable[0]!;
      const payload: CreateZernioStandaloneAdInput = {
        accountId: p.pinned.connectionAccountId,
        adAccountId: p.destination.adAccount.id,
        ...metaAdSetAdditionControls({
          campaignId: p.plan.externalId!,
          campaignBudgeted: p.cbo,
          budget: p.group.budget,
          budgetType: p.group.budgetType,
        }),
        name: p.group.name,
        adSetName: compiled.adSetNameFor(audience),
        goal,

        ...(await compiled.adFields(first.ad, first.content)),
        targeting: spec,
        placements: metaProviderPlacements(compiled.placementPlan),
        promotedObject: compiled.promotedObject,
        ...(schedule.startAt
          ? { startDate: schedule.startAt.toISOString() }
          : {}),
        ...(schedule.endAt ? { endDate: schedule.endAt.toISOString() } : {}),
        ...metaDraftProviderControls(),
      };
      // The group identity owns its first create, even across failed runs.
      const result = await createMetaAd(payload, {
        pageId: compiled.pageId,
        idempotencyKey: `add-meta-set:${p.group.id}`,
        adAccount: p.destination.adAccount,
      });
      const externalId = writtenAdSetId(result),
        adId = writtenAdId(result);
      if (adId) made.push(adId);
      if (!externalId || !adId)
        throw new Error(
          `Meta returned incomplete IDs. Check campaign ${p.plan.externalId} before retrying.`,
        );
      // The opening receipt, plan link and count commit together.
      await withTransaction(async (tx) => {
        await tx
          .update(platformDeliveryGroupTable)
          .set({ externalId, status: "paused", targetingSpec: spec ?? null })
          .where(eq(platformDeliveryGroupTable.id, p.group.id));
        await tx.insert(platformAdTable).values(
          platformAdValues({
            draft: p.plan,
            deliveryGroupId: p.group.id,
            externalAdSetId: externalId,
            adSetName: p.group.name,
            status: "paused",
            ad: {
              planAd: first.ad,
              externalId: adId,
              headline: first.content.headline,
              body: first.content.body,
              linkUrl: first.content.linkUrl ?? compiled.linkUrl,
              media: first.content.media,
            },
          }),
        );
        await tx
          .update(platformCampaignTable)
          .set({ adCount: sql`${platformCampaignTable.adCount}+1` })
          .where(eq(platformCampaignTable.id, p.plan.id));
      });
      await ensureMetaAdsPaused([externalId, adId]);
    }
    for (const { ad } of usable) {
      const result = await sendAdToExistingMetaSet(
        {
          adId: ad.id,
          platformCampaignId: p.plan.id,
          deliveryGroupId: p.group.id,
        },
        context,
      );
      made.push(...result.created.map((a) => a.externalAdId));
      await updateWorkflowRun(run, {
        progress: {
          message: `Recorded ${ad.name}`,
          completed: made.length,
          total: usable.length,
        },
      }).catch((error) =>
        console.error("Meta publish activity update failed", error),
      );
    }
    await ensureMetaAdsPaused(made);
    await updateWorkflowRun(run, {
      status: "succeeded",
      progress: {
        message:
          "Additions created paused. Existing delivery and budget unchanged.",
      },
    }).catch((error) =>
      console.error("Meta publish activity update failed", error),
    );
    return { deliveryGroupId: p.group.id, createdAdIds: made, warnings };
  } catch (error) {
    if (made.length)
      await ensureMetaAdsPaused(made).catch((error) =>
        console.error("Meta publish activity update failed", error),
      );
    await failWorkflowRun(run, error);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${made.length ? ` Created new ad IDs: ${made.join(", ")}. Review the partial result before retrying.` : ""}`,
    );
  }
}

export async function refreshMetaCampaign(input: {
  platformCampaignId: string;
  organizationId: string;
}) {
  const plan = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!plan?.campaignId || plan.platform !== "meta_ads")
    throw new Error("Meta campaign not found");
  const { brand } = await requireOwnedCampaign(
    plan.campaignId,
    input.organizationId,
  );
  const account = platformCampaignAdAccount(plan);
  if (!brand.slug || !account)
    throw new Error("Campaign has no verified ad account");
  const result = await syncZernioAds({
    brandSlug: brand.slug,
    platform: "meta_ads",
    adAccountId: account,
    sinceDays: null,
  });
  return {
    updated: result.updated,
    adsWritten: result.adsWritten,
    errors: result.errors,
  };
}
