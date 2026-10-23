import {
  refreshMetaCampaignAction,
  previewMetaAdditionsAction,
  publishMetaAdditionsAction,
  addDeliveryGroupAction,
  pushAdAction,
  duplicateAdAction,
  removePlatformAdAction,
} from "@/server/ai/capabilities/ads";
import { adsFromCarouselsSchema } from "@/lib/ads-from-carousels";
import {
  approvedCarouselOptions,
  createAdsFromCarousels,
} from "@/server/services/ads-from-carousels.service";
import { STARTER_AD_TYPES } from "@/lib/starter-ad-ideas";
import { adSectionSchema } from "@/lib/ad-section";
import { saveAdSection } from "@/server/services/ad-set.service";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { audienceTable, campaignAudienceAssetTable } from "@/server/db/schema";
import { requireOwnedCampaign } from "@/server/services/ads-draft.service";
import { adAuthoringScopeSchema } from "@/lib/ad-authoring";
import { after } from "next/server";
import { starterGenerationSchema } from "@/lib/starter-ad-generation";
import { compositionFormatIdSchema } from "@/lib/compositions";
import { suggestImagePosition } from "@/server/services/image-crop.service";
import {
  startStarterGeneration,
  runStarterGeneration,
  starterGenerationStatus,
} from "@/server/services/starter-ad-generation.service";
import { z } from "zod";
import { ideaShapeSchema } from "@/lib/ad-idea-studio";
import { draftAdCreativeCopy } from "@/server/services/ad-creative-copy.service";
import { channelPlatformEnum } from "@/server/db/channel-schema";

import {
  listAdSet,
  setAdPhotoOnly,
  setAdTextOnly,
  setAdPlatforms,
  setCardCopy,
} from "@/server/services/ad-set.service";
import { researchGoogleKeywords } from "@/server/services/ads-write.service";
import {
  addStarterAdIdeas,
  starterIdeaHomes,
} from "@/server/services/ads-draft.service";
import { workspaceProcedure, actionProcedure } from "@/server/api/orpc";
import {
  topAds,
  setDeliveryAction,
  draftCampaignAction,
  duplicateCampaignAction,
  draftAdAction,
  writeGoogleTextAdsAction,
  addAdShellAction,
  createAdsFromAssetsAction,
  addAudienceAction,
  updateAudienceAction,
  suggestCampaignAudiencesAction,
  linkAudienceAction,
  createGoogleAdsAccountAction,
  createReportingConversionAction,
  createLeadFormAction,
  listLeadFormsAction,
  setPlatformDraftAction,
  setDeliveryGroupAction,
  deleteDeliveryGroupAction,
  setCreativePoolAction,
  setPlacementCopyAction,
  previewAdAction,
  pushDraftAction,
  deletePlatformCampaignAction,
  saveIdeaAction,
  importMetaCampaignAction,
  importCreativeAction,
  planPlatformAction,
  listCampaignsAction,
  listAdsDestinations,
  deleteCampaignDraftAction,
  deleteCampaignLeavingPlatformAction,
  deleteAudienceAction,
  attachAdSetAction,
  setAdStatusAction,
  returnAdToStudioAction,
  setAdCopyAction,
  setAdHomeAction,
  clearPlacementAction,
  freezePlacementAction,
  unfreezePlacementAction,
  deleteAdDraftAction,
  attachCampaignAction,
  replaceAdCardAction,
  pullPlatformAudiencesAction,
} from "@/server/ai/capabilities/ads";

export const adsRouter = {
  approvedCarousels: workspaceProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(({ input, context }) =>
      approvedCarouselOptions(input.brandId, context.workspace.orgId),
    ),
  fromCarousels: workspaceProcedure
    .input(adsFromCarouselsSchema)
    .handler(({ input, context }) =>
      createAdsFromCarousels(input, {
        orgId: context.workspace.orgId,
        userId: context.session.user.id,
      }),
    ),
  saveSection: workspaceProcedure
    .input(adSectionSchema)
    .handler(({ input, context }) =>
      saveAdSection(input, context.workspace.orgId),
    ),
  unlinkAudienceAsset: workspaceProcedure
    .input(
      z.object({
        audienceId: z.string().min(1),
        platform: z.enum(channelPlatformEnum.enumValues),
      }),
    )
    .handler(async ({ input, context: ctx }) => {
      const audience = await db.query.audienceTable.findFirst({
        where: eq(audienceTable.id, input.audienceId),
      });
      if (!audience) throw new Error("Audience not found");
      await requireOwnedCampaign(audience.campaignId, ctx.workspace.orgId);
      await db
        .delete(campaignAudienceAssetTable)
        .where(
          and(
            eq(campaignAudienceAssetTable.audienceId, input.audienceId),
            eq(campaignAudienceAssetTable.platform, input.platform),
          ),
        );
      return { unlinked: true };
    }),

  // The /overview top-ads card refetches here when its controls change, with
  // no model round-trip.
  topAds: actionProcedure(topAds),

  /** Mirror the ad account's audiences; the Audiences tab's refresh. */
  pullAudiences: actionProcedure(pullPlatformAudiencesAction),

  /**
   * The Launch/Pause button. A provider write that starts or stops spend, so
   * it stays a deliberate operator click — the mutation is the approval.
   */
  setCampaignDelivery: actionProcedure(setDeliveryAction),

  /** A local draft: the editable object chat and the canvas work on. No
   *  provider call — launching is the separate, approved step. */
  createDraft: actionProcedure(draftCampaignAction),
  /** A local copy of a campaign: ads, audiences and platform drafts under
   *  fresh ids, unpushed. The push is the separate step. */
  duplicateCampaign: actionProcedure(duplicateCampaignAction),

  /** The copy pass: AI words onto the drafts already drawn. Captions and editable image words together. */
  draftCreativeCopy: workspaceProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        scope: z.enum(["all", "caption", "image"]),
      }),
    )
    .handler(({ input, context: ctx }) =>
      draftAdCreativeCopy({ ...input, orgId: ctx.workspace.orgId }),
    ),

  draftAd: actionProcedure(draftAdAction),
  saveIdea: actionProcedure(saveIdeaAction),
  /** The AI's crop for a newly chosen photo at one ad size. */
  suggestCrop: workspaceProcedure
    .input(
      z.object({ url: z.string().url(), formatId: compositionFormatIdSchema }),
    )
    .handler(async ({ input }) => suggestImagePosition(input)),

  starterIdeaHomes: workspaceProcedure
    .input(
      z
        .object({
          campaignId: z.string().min(1).optional(),
          brandId: z.string().min(1).optional(),
          groupId: z.string().min(1).optional(),
          allHomes: z.boolean().optional(),
        })
        .refine((value) => value.campaignId || value.brandId, {
          message: "campaignId or brandId is required",
        }),
    )
    .handler(async ({ context: ctx, input }) =>
      starterIdeaHomes({
        ...input,
        organizationId: ctx.workspace.orgId,
      }),
    ),
  generateStarterIdeas: workspaceProcedure
    .input(starterGenerationSchema)
    .handler(async ({ context: ctx, input }) => {
      const args = {
        ...input,
        organizationId: ctx.workspace.orgId,
        userId: ctx.session.user.id,
      };
      const run = await startStarterGeneration(args);
      after(() => runStarterGeneration(run.runId, args));
      return run;
    }),
  starterGenerationStatus: workspaceProcedure
    .input(adAuthoringScopeSchema)
    .handler(async ({ context: ctx, input }) =>
      starterGenerationStatus({
        ...input,
        organizationId: ctx.workspace.orgId,
      }),
    ),
  brandAds: workspaceProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(({ context: ctx, input }) =>
      listAdSet({ ...input, orgId: ctx.workspace.orgId }),
    ),

  /** Editable starter ads, blank or prefilled from selected homes. */
  addStarterIdeas: workspaceProcedure
    .input(
      z
        .object({
          campaignId: z.string().min(1).optional(),
          brandId: z.string().min(1).optional(),
          batchId: z.string().uuid().optional(),
          adTypes: z.array(z.enum(STARTER_AD_TYPES)).min(1).max(3).optional(),
          exportShapes: z.array(ideaShapeSchema).min(1).max(4).optional(),
          bookingTargetId: z.string().min(1).optional(),
          source: z.enum(["blank", "featured", "shells"]).default("blank"),
          homeIds: z.array(z.string().min(1)).min(1).max(10).optional(),
        })
        .refine(
          (value) => Boolean(value.campaignId) !== Boolean(value.brandId),
          { message: "Supply either campaignId or brandId." },
        ),
    )
    .handler(async ({ context: ctx, input }) =>
      addStarterAdIdeas({
        ...input,
        organizationId: ctx.workspace.orgId,
      }),
    ),

  /** Google Search text ideas from the landing page and audiences' terms. */
  writeGoogleTextAds: actionProcedure(writeGoogleTextAdsAction),

  /** An empty ad of a declared format, waiting for its creative. */
  addAdShell: actionProcedure(addAdShellAction),

  /** Finished creatives from the library, as one static each or one carousel. */
  createAdsFromAssets: actionProcedure(createAdsFromAssetsAction),

  /** Bind an ad to one of their homes, or unbind it. */
  setAdHome: actionProcedure(setAdHomeAction),

  /** One change to an ad's cards; uploads arrive as library assets. */

  /** Put the approved drafts, or the named ones, into a campaign. */
  attachAdSet: actionProcedure(attachAdSetAction),

  /** Remove one ad, drafted or in a campaign. */
  deleteAd: actionProcedure(deleteAdDraftAction),

  /** Production state on one drafted ad. Touches no platform. */
  setAdStatus: actionProcedure(setAdStatusAction),
  returnToStudio: actionProcedure(returnAdToStudioAction),

  /** The words on one drafted ad; its cards are left alone. */
  setAdCopy: actionProcedure(setAdCopyAction),

  setAdPhotoOnly: workspaceProcedure
    .input(z.object({ adId: z.string().min(1), photoOnly: z.boolean() }))
    .handler(async ({ context: ctx, input }) =>
      setAdPhotoOnly({
        adId: input.adId,
        orgId: ctx.workspace.orgId,
        photoOnly: input.photoOnly,
      }),
    ),

  setAdTextOnly: workspaceProcedure
    .input(z.object({ adId: z.string().min(1), textOnly: z.boolean() }))
    .handler(async ({ context: ctx, input }) =>
      setAdTextOnly({
        adId: input.adId,
        orgId: ctx.workspace.orgId,
        textOnly: input.textOnly,
      }),
    ),

  setAdPlatforms: workspaceProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        platforms: z.array(z.enum(channelPlatformEnum.enumValues)).nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) =>
      setAdPlatforms({
        adId: input.adId,
        orgId: ctx.workspace.orgId,
        platforms: input.platforms,
      }),
    ),

  setCardCopy: workspaceProcedure
    .input(
      z.object({
        adId: z.string().min(1),
        index: z.number().int().min(0),
        title: z.string().max(120),
      }),
    )
    .handler(async ({ context: ctx, input }) =>
      setCardCopy({
        adId: input.adId,
        orgId: ctx.workspace.orgId,
        index: input.index,
        title: input.title,
      }),
    ),

  /** Put a different library asset in one card slot of a drafted ad. */
  replaceAdMedia: actionProcedure(replaceAdCardAction),

  addAudience: actionProcedure(addAudienceAction),
  updateAudience: actionProcedure(updateAudienceAction),
  suggestCampaignAudiences: actionProcedure(suggestCampaignAudiencesAction),
  linkAudience: actionProcedure(linkAudienceAction),
  createReportingConversion: actionProcedure(createReportingConversionAction),
  createGoogleAdsAccount: actionProcedure(createGoogleAdsAccountAction),
  /** The instant forms on the Page the brand's Meta ads run as. */
  leadForms: actionProcedure(listLeadFormsAction),
  createLeadForm: actionProcedure(createLeadFormAction),

  importAdCreative: actionProcedure(importCreativeAction),

  planPlatform: actionProcedure(planPlatformAction),

  /** Adopt a synced platform campaign under a first-party campaign. */
  attachPlatformCampaign: actionProcedure(attachCampaignAction),

  importMetaCampaign: actionProcedure(importMetaCampaignAction),

  setPlatformDraft: actionProcedure(setPlatformDraftAction),
  setDeliveryGroup: actionProcedure(setDeliveryGroupAction),
  addDeliveryGroup: actionProcedure(addDeliveryGroupAction),
  previewAdditions: actionProcedure(previewMetaAdditionsAction),
  refreshMeta: actionProcedure(refreshMetaCampaignAction),
  publishAdditions: actionProcedure(publishMetaAdditionsAction),
  pushAd: actionProcedure(pushAdAction),
  duplicateAd: actionProcedure(duplicateAdAction),
  removePlatformAd: actionProcedure(removePlatformAdAction),
  deleteDeliveryGroup: actionProcedure(deleteDeliveryGroupAction),

  setCampaignCreativePool: actionProcedure(setCreativePoolAction),

  /**
   * Keyword Planner for the brand's Google account. Read-only: it creates
   * nothing and spends nothing, so it needs no approval gate.
   */
  researchKeywords: workspaceProcedure
    .input(
      z.object({
        brandSlug: z.string().min(1),
        seedKeywords: z.array(z.string().trim().min(1)).max(20).optional(),
        seedUrl: z.string().url().optional(),
        estimateKeywords: z.array(z.string().trim().min(1)).max(200).optional(),
        countries: z.array(z.string().length(2)).max(25).optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) =>
      researchGoogleKeywords({
        organizationId: ctx.workspace.orgId,
        ...input,
      }),
    ),

  campaigns: actionProcedure(listCampaignsAction),

  /** Meta's own pre-create previews of a drafted ad. Provider read. */
  previewAd: actionProcedure(previewAdAction),

  /** The allowlisted destinations for the push dialog. */
  destinations: actionProcedure(listAdsDestinations),

  /**
   * Create the draft on Meta — PAUSED — via Zernio's multi-creative shape.
   * A provider write behind a deliberate operator click; spend starts only
   * when the delivery switch is flipped afterwards.
   */
  pushDraftToPlatform: actionProcedure(pushDraftAction),
  /**
   * Deletes. The provider one cascades on a real ad account, so it stays an
   * operator click — it is deliberately not exposed to chat.
   */
  deletePlatformCampaign: actionProcedure(deletePlatformCampaignAction),

  deleteDraftCampaign: actionProcedure(deleteCampaignDraftAction),
  deleteCampaignLeavingPlatform: actionProcedure(
    deleteCampaignLeavingPlatformAction,
  ),

  deleteAudience: actionProcedure(deleteAudienceAction),

  // ---- Placement cells: one platform × placement of one ad ----------------

  setPlacementCopy: actionProcedure(setPlacementCopyAction),

  clearPlacement: actionProcedure(clearPlacementAction),

  freezePlacement: actionProcedure(freezePlacementAction),

  unfreezePlacement: actionProcedure(unfreezePlacementAction),
};
