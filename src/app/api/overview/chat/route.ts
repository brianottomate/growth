import {
  campaignFocusForTurn,
  catalogFocusForTurn,
  latestAssistantFocus,
} from "@/lib/assistant-focus";
import { after } from "next/server";
import {
  claimChatTurn,
  assertChatTurn,
  readChatSteering,
  finishChatTurn,
  ChatTurnError,
} from "@/server/services/chat-turn.service";
import { adChatContext } from "@/server/services/ad-chat-context.service";
import { contactSheet } from "@/server/services/starter-ad-generation.service";
import { catalogHomeContext } from "@/server/services/catalog-studio.service";
import { catalogLocation } from "@/lib/catalog-studio";
import { marketOf } from "@/lib/markets";
import { streamErrorMessage } from "@/server/ai/kernel/stream-error";

import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  consumeStream,
  isToolUIPart,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  assistantMessageTable,
  assistantThreadTable,
  brandTable,
  campaignTable,
  contentPostTable,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { OVERVIEW_AGENT_PERSONA } from "@/server/ai/overview-agent/persona";
import {
  BRAND_STORY_UPKEEP,
  brandStorySection,
  catalogHomeSection,
  catalogNewCopyPrompt,
  adCopyChatSection,
  triggeredIntentPrompt,
} from "@/server/ai/prompts";
import { resolvePageContext } from "@/server/ai/kernel/resolve-page-context";
import { anthropicTools } from "@/server/ai/kernel/anthropic-tools";
import { legacyApprovalTools } from "@/server/ai/kernel/operations";
import { NATIVE_TOOLS, OVERVIEW_TOOLS } from "@/server/ai/capabilities";
import { composeGrowthContext } from "@/server/ai/kernel/context";
import { composePageContextSection } from "@/server/ai/kernel/page-context";
import { compactGrowthError } from "@/server/ai/kernel/errors";
import {
  completeAssistantRun,
  failAssistantRun,
  startAssistantRun,
} from "@/server/ai/kernel/journal";
import { GROWTH_MAX_OUTPUT_TOKENS } from "@/server/ai/kernel/limits";
import {
  GROWTH_CONVERSATION_CACHE_TTL,
  growthCacheTtlForStep,
  withGrowthRollingCache,
} from "@/server/ai/kernel/prompt-cache";
import { buildGrowthToolRuntime } from "@/server/ai/kernel/runtime";
import { summarizeGrowthUsage } from "@/server/ai/kernel/usage";
import {
  approvalHasExpired,
  isApprovalDenial,
  validateApprovalContinuation,
  withRequestContext,
} from "@/server/ai/kernel/approval-continuation";
import { runtimeClockSection } from "@/server/ai/kernel/runtime-clock";
import type {
  AssistantIntent,
  AdCampaignWorkContext,
  CatalogHomeWorkContext,
  ContentWorkContext,
} from "@/lib/assistant-events";
import {
  isChatAttachmentMediaType,
  isOwnedChatAttachmentUrl,
  MAX_CHAT_ATTACHMENTS,
} from "@/lib/chat-attachment";

/**
 * /overview chat agent — a general growth back-office assistant.
 *
 * Same shape as the /plan agent route (resolve org → build org-scoped read-only
 * tools → streamText in a multi-step loop), but with a broad orientation
 * persona instead of the blueprint-drafting one. This is the seed of a future
 * home screen / MCP surface; keep it minimal and let the tool registry grow.
 */
// Blog-agent edits can include a Dato upload job and a verify pass. Keep the
// durable chat drain alive long enough to complete that bounded inner loop.
// Fluid compute's ceiling on Pro. The model loop stops TURN_DEADLINE_MS in,
// leaving time to persist the reply and close the run before the platform
// kills the function; a killed function saves nothing.
export const maxDuration = 800;
const TURN_DEADLINE_MS = (maxDuration - 45) * 1000;

const MODEL = "claude-sonnet-5";
function sanitizeForModel(history: UIMessage[]) {
  return history
    .map((message, index) => {
      if (message.role === "user") {
        return {
          ...message,
          parts: message.parts.filter(
            (part) =>
              part.type !== "file" ||
              ((part as { mediaType?: string }).mediaType ?? "").startsWith(
                "image/",
              ),
          ),
        };
      }
      if (index === history.length - 1) {
        return message;
      }
      return {
        ...message,
        parts: message.parts.filter(
          (part) =>
            !isToolUIPart(part) ||
            part.state === "output-available" ||
            part.state === "output-error",
        ),
      };
    })
    .filter(
      (message) => message.role !== "assistant" || message.parts.length > 0,
    );
}

/**
 * Which step of the campaign page the operator asked from. Local steps are
 * built, not proposed: the chat makes the piece, reports it in a line, and
 * the operator iterates on it. Nothing here pushes or spends.
 */
const BUILD_FIRST =
  " Build it now instead of asking whether to: make the call, then say in one line what you made and offer the one change most worth trying. The operator iterates from there.";

function campaignFocusPrompt(focus: AdCampaignWorkContext["focus"]) {
  switch (focus) {
    case "photos":
      return `\n\nThe operator asked from the Photos step: fill this campaign's pool. Check mediaLibraryRead.list for the brand first; mediaLibraryWrite.importListingPhotos brings in their listing photos, and adsWrite.setCreativePool sets the pool from library assets.${BUILD_FIRST}`;
    case "ads":
      return `\n\nThe operator asked from the Ads step: they want ads drafted or improved. For a brand with featured WanderOS homes, adsWrite.generateStarterIdeas is the fast path (a static and a carousel per featured home); otherwise adsWrite.draftAd with pool media. Write the copy yourself, do not ask them for it.${BUILD_FIRST}`;
    case "audiences":
      return `\n\nThe operator asked from the Audiences step: create the audience. Broad with a geography is the default that leaves the learning phase at these budgets; derive the geography from where the brand's guests come from or, failing that, its homes' region and the brand's personas. Create it with adsWrite.addAudience.${BUILD_FIRST}`;
    case "platforms":
      return `\n\nThe operator asked from the Platforms step: plan the platform they named (Meta if they named none) and set it up. Create the local draft with adsWrite.planPlatform; it needs no Zernio connection or ad account, so an absent connection must not block it. Then fill its setup with adsWrite.setPlatformDraft: a daily budget from the client's monthly media budget, and, when adsRead.listDestinations returns exactly one allowlisted ad account, that account and its trackingDefaults. With several accounts, ask which. Finish with what still stands between the draft and a push (no connection, no ad account, no tracking, unapproved ads), one line each. Nothing is pushed here.${BUILD_FIRST}`;
    case "live":
      return "\n\nThe operator asked from the Live step: what the pushed campaign is doing. Read adsRead.openCampaign and adsRead.top, report spend against budget, and suggest at most one change.";
    default:
      return "";
  }
}

export async function POST(req: Request): Promise<Response> {
  const requestNow = new Date();
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const currentUser = session.user;
  const activeOrganizationId = session.session.activeOrganizationId;
  const memberships = await db.query.memberTable.findMany({
    where: activeOrganizationId
      ? and(
          eq(memberTable.userId, currentUser.id),
          eq(memberTable.organizationId, activeOrganizationId),
        )
      : eq(memberTable.userId, currentUser.id),
    columns: { organizationId: true },
    limit: 2,
  });
  if (memberships.length !== 1 || !memberships[0]?.organizationId) {
    return new Response(
      memberships.length > 1
        ? "Select an active organization"
        : "No organization",
      { status: 403 },
    );
  }
  const membership = memberships[0];

  const submitted = (await req.json()) as {
    threadId?: string;
    inputId?: string;
    trigger?: string;
    messages?: UIMessage[];
  };
  if (!submitted.threadId)
    return Response.json({ error: "A session is required" }, { status: 400 });
  const claimedThreadId = submitted.threadId;
  const inputId = submitted.inputId;
  let claimed;
  try {
    claimed = await claimChatTurn(
      { userId: currentUser.id, organizationId: membership.organizationId },
      claimedThreadId,
      inputId,
      submitted.trigger === "submit-message" &&
        submitted.messages?.at(-1)?.role === "assistant",
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to start response",
      },
      { status: error instanceof ChatTurnError ? error.status : 500 },
    );
  }
  const turnId = claimed.turnId;
  const requestBody = claimed.payload
    ? {
        ...claimed.payload.context,
        threadId: claimedThreadId,
        messages: [claimed.payload.message],
      }
    : submitted;
  const executeTurn = async () => {
    const {
      messages,
      surface,
      brandId,
      intent: rawIntent,
      assistantIntent,
      workContext,
      campaignContext,
      catalogContext,
      contextMode: requestedContextMode,
      chatAttachment,
      chatAttachments,
      skippedAttachments,
      threadId,
      pagePath,
      trigger,
      messageId,
    } = requestBody as {
      messages: UIMessage[];
      surface?: "overview" | "create" | "next";
      brandId?: string;
      intent?: string;
      assistantIntent?: AssistantIntent;
      workContext?: ContentWorkContext;
      campaignContext?: AdCampaignWorkContext;
      catalogContext?: CatalogHomeWorkContext;
      contextMode?: "page" | "pinned";
      chatAttachment?: { url?: string; mediaType?: string; fileName?: string };
      chatAttachments?: {
        url?: string;
        mediaType?: string;
        fileName?: string;
      }[];
      skippedAttachments?: {
        name?: string;
        sizeMb?: number;
        reason?: string;
      }[];
      threadId?: string;
      pagePath?: string;
      trigger?: "submit-message" | "regenerate-message";
      messageId?: string;
    };
    if (!threadId || !messages?.length) {
      return Response.json(
        { error: "A session and message are required" },
        { status: 400 },
      );
    }
    const thread = await db.query.assistantThreadTable.findFirst({
      where: and(
        eq(assistantThreadTable.id, threadId),
        eq(assistantThreadTable.organizationId, membership.organizationId),
        or(
          eq(assistantThreadTable.createdBy, currentUser.id),
          eq(assistantThreadTable.visibility, "shared"),
        ),
      ),
    });
    if (!thread) return new Response("Session not found", { status: 404 });
    const intent = ["plan", "create", "place", "analyze"].includes(
      rawIntent ?? "",
    )
      ? rawIntent
      : undefined;

    const contextMode = assistantIntent ? "pinned" : requestedContextMode;
    const pageContext = await resolvePageContext(
      pagePath ?? "",
      membership.organizationId,
    );
    const requestedWorkContext =
      assistantIntent?.type === "work_content_post"
        ? assistantIntent
        : assistantIntent || contextMode === "page"
          ? undefined
          : workContext;
    const workItem = requestedWorkContext?.contentPostId
      ? await db.query.contentPostTable.findFirst({
          where: and(
            eq(contentPostTable.id, requestedWorkContext.contentPostId),
            isNull(contentPostTable.deletedAt),
          ),
          with: {
            brand: { columns: { organizationId: true, name: true } },
            platformPosts: { columns: { id: true, platform: true } },
          },
        })
      : null;
    const selectedPlatformPost = workItem?.platformPosts.find(
      (post) => post.id === requestedWorkContext?.platformPostId,
    );
    const activeWorkContext: ContentWorkContext | null =
      workItem?.brand?.organizationId === membership.organizationId
        ? {
            type: "work_content_post",
            brandId: workItem.brandId,
            brandName: workItem.brand.name,
            contentPostId: workItem.id,
            contentTitle: workItem.title ?? "Untitled",
            platformPostId: selectedPlatformPost?.id,
            platform: selectedPlatformPost?.platform,
          }
        : null;
    const persisted = await db.query.assistantMessageTable.findMany({
      where: eq(assistantMessageTable.threadId, thread.id),
      orderBy: [
        asc(assistantMessageTable.createdAt),
        asc(assistantMessageTable.id),
      ],
    });
    const savedFocus = latestAssistantFocus(
      persisted.map((row) => row.message),
    );
    const savedAdContext = savedFocus?.adWorkContext ?? undefined;
    const requestedCampaignContext =
      assistantIntent && assistantIntent.type !== "work_ad_campaign"
        ? undefined
        : campaignFocusForTurn({
            mode: contextMode,
            intent:
              assistantIntent?.type === "work_ad_campaign"
                ? assistantIntent
                : undefined,
            page:
              pageContext.campaign && pageContext.brand
                ? {
                    type: "work_ad_campaign",
                    campaignId: pageContext.campaign.id,
                    brandId: pageContext.brand.id,
                    brandName: pageContext.brand.name,
                    campaignName: pageContext.campaign.name,
                  }
                : undefined,
            pinned: campaignContext,
            saved: savedAdContext,
          });
    const campaignWorkItem = requestedCampaignContext?.campaignId
      ? await db.query.campaignTable.findFirst({
          where: eq(campaignTable.id, requestedCampaignContext.campaignId),
          with: { brand: { columns: { organizationId: true, name: true } } },
        })
      : null;
    const activeCampaignContext: AdCampaignWorkContext | null =
      campaignWorkItem?.brand?.organizationId === membership.organizationId
        ? {
            type: "work_ad_campaign",
            brandId: campaignWorkItem.brandId,
            brandName: campaignWorkItem.brand.name,
            campaignId: campaignWorkItem.id,
            campaignName: campaignWorkItem.name,
            focus: requestedCampaignContext?.focus,
            adId: requestedCampaignContext?.adId,
          }
        : null;

    const activeAd = activeCampaignContext?.adId
      ? await adChatContext({
          organizationId: membership.organizationId,
          campaignId: activeCampaignContext.campaignId,
          adId: activeCampaignContext.adId,
        })
      : null;

    const requestedCatalogContext = catalogFocusForTurn({
      mode: contextMode,
      intent: assistantIntent,
      pinned: catalogContext,
      saved: savedFocus?.catalogHomeContext,
    });
    const catalogHome = requestedCatalogContext
      ? await catalogHomeContext(
          currentUser.id,
          requestedCatalogContext.brandId,
          requestedCatalogContext.homeId,
        )
          .then((ctx) =>
            ctx.brand.organizationId === membership.organizationId ? ctx : null,
          )
          .catch(() => null)
      : null;
    // The button's focus steers only the turn it opened.
    const activeCatalogContext = catalogHome
      ? {
          type: "work_catalog_home" as const,
          brandId: catalogHome.brand.id,
          brandName: catalogHome.brand.name,
          homeId: catalogHome.home.id,
          homeName: catalogHome.home.name,
        }
      : undefined;

    const requestedBrandId =
      catalogHome?.brand.id ??
      activeCampaignContext?.brandId ??
      activeWorkContext?.brandId ??
      (assistantIntent && "brandId" in assistantIntent
        ? assistantIntent.brandId
        : null) ??
      (contextMode === "page" ? (pageContext.brand?.id ?? brandId) : brandId);
    const brand = requestedBrandId
      ? await db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.id, requestedBrandId),
            eq(brandTable.organizationId, membership.organizationId),
            isNull(brandTable.deletedAt),
          ),
          columns: { id: true, name: true },
        })
      : null;

    const surfaceContext =
      surface === "create" || surface === "next"
        ? `\n\n# Current surface\nThe operator is in the unified Next conversation${brand ? ` for ${brand.name} (brandId: ${brand.id})` : ""}${intent ? ` with intent \"${intent}\"` : ""}. The default operating horizon is the next 14 days. Treat questions, pasted images, links, and rough thoughts as one continuous iteration loop. First establish readiness with brandRead action next when a brand is known. Do not pretend this is an editing studio. Prefer the smallest useful action, keep suggestions to at most three and usually one, execute authorized workspace changes without redundant approval cards, then point or navigate the operator to the existing content, schedule, calendar, media, or review surface where the result belongs. When the creative direction is genuinely ready for production, call prepareProductionPacket action prepare. Copying that packet into Claude Design, ChatGPT, a video editor, or an agency workflow is a first-class outcome; Fal is only an optional experiment that consumes the same reviewed packet.`
        : "";
    const intentContext = triggeredIntentPrompt(assistantIntent, brand ?? null);
    const campaignContextPrompt =
      activeCampaignContext && brand
        ? `\n\n# Active ad campaign\nThe operator is working on the campaign “${activeCampaignContext.campaignName}” (campaignId: ${activeCampaignContext.campaignId}) for ${brand.name} (brandId: ${brand.id}). Use this exact brandId; never construct an ID from a slug. Call adsRead.openCampaign first so you are working from its current state, not from earlier in this conversation.\n\nIt is a first-party campaign: ads and ad sets live on it, and local per-platform drafts are created with adsWrite.planPlatform before anything is pushed. No provider connection is required to plan. Local edits touch no provider: adsWrite.draftAd adds an ad, adsWrite.addAdSet adds an ad set (audience and budget live there; omitting both audience fields means broad, which is often right), adsWrite.setCreativePool sets the shared images, and adsWrite.setGoogleSettings is required before any Google push.\n\nadsWrite.push creates the campaign tree PAUSED, so it cannot spend; adsWrite.setDelivery with status active is what starts spend on the client's account. Both ask the operator to approve before they run. Offer them when the campaign looks ready, and run them only when the operator asks, never unprompted. Call adsRead.listDestinations for account ids rather than guessing them. Prefer concrete copy over suggestion lists.${campaignFocusPrompt(activeCampaignContext.focus)}`
        : "";
    const workContextPrompt =
      campaignContextPrompt +
      (activeAd
        ? adCopyChatSection({
            adId: activeAd.ad.id,
            copyRules: activeAd.copyRules,
            snapshot: { ...activeAd, copyRules: undefined },
          })
        : "") +
      (activeWorkContext && brand
        ? `\n\n# Active content work item\nThe operator is working on “${activeWorkContext.contentTitle}” (contentPostId: ${activeWorkContext.contentPostId}) for ${brand.name}.${activeWorkContext.platformPostId ? ` Focus the ${activeWorkContext.platform ?? "selected"} rendering (platformPostId: ${activeWorkContext.platformPostId}).` : ""} Call contentRead action getWorkItem before making claims about readiness or current copy. Prefer concrete edits over suggestion lists, and apply authorized writes directly.`
        : "");
    const catalogHeroNumber = catalogHome
      ? catalogHome.photos.findIndex(
          // Feed and listing detail serve the same asset at different sizes.
          (p) =>
            p.url.replace(/\/[^/]*$/, "") ===
            catalogHome.home.imageUrl?.replace(/\/[^/]*$/, ""),
        ) + 1
      : 0;
    const catalogHomePrompt = catalogHome
      ? catalogHomeSection({
          homeName: catalogHome.home.name,
          homeId: catalogHome.home.id,
          brandName: catalogHome.brand.name,
          brandId: catalogHome.brand.id,
          heroPhotoNumber: catalogHeroNumber || null,
          card: catalogHome.card
            ? {
                headline: catalogHome.card.title,
                pills: catalogHome.card.pills ?? [],
                facts: catalogHome.card.subtitle,
                templateId: catalogHome.card.templateId,
                included: catalogHome.card.included,
                mode: catalogHome.card.mode ?? "compose",
              }
            : null,
          place: catalogLocation(catalogHome.home, catalogHome.brand.markets),
          listing: {
            bedrooms: catalogHome.home.bedrooms,
            bathrooms: catalogHome.home.bathrooms,
            guests: catalogHome.home.guests,
            amenities: catalogHome.amenities,
            description: catalogHome.description?.slice(0, 4000) ?? null,
            locationDescription: catalogHome.locationDescription,
            petsAllowed: catalogHome.petsAllowed,
            market: marketOf(catalogHome.brand.markets, catalogHome.home.city),
          },
          existingCopy: catalogHome.existingCopy,
          copyPrompt: catalogNewCopyPrompt({
            brandName: catalogHome.brand.name,
            story: brandStorySection({
              brandName: catalogHome.brand.name,
              story: catalogHome.brand.story,
            }),
            place: catalogLocation(catalogHome.home, catalogHome.brand.markets),
            brandWide: catalogHome.brandWide,
            templateId: catalogHome.card?.templateId ?? "catalog-place-plain",
          }),
          siblings: catalogHome.siblings,
          brandWide: catalogHome.brandWide,
          focus:
            assistantIntent?.type === "work_catalog_home"
              ? assistantIntent.focus
              : undefined,
        })
      : "";
    const attachmentCandidates = Array.isArray(chatAttachments)
      ? chatAttachments
      : chatAttachment
        ? [chatAttachment]
        : [];
    const seenAttachmentUrls = new Set<string>();
    const safeAttachments = attachmentCandidates
      .filter(
        (
          attachment,
        ): attachment is {
          url: string;
          mediaType: string;
          fileName?: string;
        } => {
          if (
            !attachment.url ||
            !attachment.mediaType ||
            !isChatAttachmentMediaType(attachment.mediaType) ||
            !isOwnedChatAttachmentUrl(attachment.url, currentUser.id) ||
            seenAttachmentUrls.has(attachment.url)
          ) {
            return false;
          }
          seenAttachmentUrls.add(attachment.url);
          return true;
        },
      )
      .slice(0, MAX_CHAT_ATTACHMENTS);
    const attachmentList = safeAttachments
      .map(
        (attachment, index) =>
          `${index + 1}. ${attachment.fileName ?? "attachment"}: ${attachment.url} (${attachment.mediaType})`,
      )
      .join("\n");
    const imageCount = safeAttachments.filter((attachment) =>
      attachment.mediaType.startsWith("image/"),
    ).length;
    const videoCount = safeAttachments.length - imageCount;
    const attachmentPrompt =
      safeAttachments.length > 0
        ? `\n\n# Current chat media\nThe operator attached ${imageCount} image${imageCount === 1 ? "" : "s"} and ${videoCount} video${videoCount === 1 ? "" : "s"}. Images are available as vision inputs. Videos are durable uploads that you can save, name, and organize, but you cannot claim to have visually analyzed their frames in this turn. Their trusted URLs are:\n${attachmentList}${activeWorkContext && imageCount > 0 ? "\nIf the operator asks to use or attach images to the active content work item, call contentMediaWrite action attachChatImage with the complete image array in this order." : ""}\nIf the operator asks to keep any attachment in a brand's media library, call mediaLibraryWrite action saveChatMedia with the complete requested media set. For a DatoCMS blog task, pass only the specific image the operator selects as blogAgent attachmentUrl. Do not save attachments merely because they were added.`
        : activeWorkContext
          ? `\n\n# Persisted image continuity\nIf the operator refers to images pasted earlier in this conversation, call contentMediaWrite action attachChatImage without inventing URLs or MIME types. The action resolves the complete image set from the newest user message with owned attachments in the durable thread.`
          : "";
    const SKIP_REASONS: Record<string, string> = {
      unsupported: "unsupported file type",
      too_large: "over the chat attachment size limit",
    };
    const safeSkipped = (
      Array.isArray(skippedAttachments) ? skippedAttachments : []
    )
      .filter(
        (item): item is { name: string; sizeMb?: number; reason?: string } =>
          typeof item?.name === "string",
      )
      .slice(0, 10);
    const skippedPrompt =
      safeSkipped.length > 0
        ? `\n\n# Attachments the composer had to skip\nThe operator just tried to attach ${safeSkipped.length} file${safeSkipped.length === 1 ? "" : "s"} the chat cannot take:\n${safeSkipped
            .map(
              (item, index) =>
                `${index + 1}. ${item.name.slice(0, 120)}${typeof item.sizeMb === "number" ? ` (${item.sizeMb} MB)` : ""} — ${SKIP_REASONS[item.reason ?? ""] ?? "not attachable in chat"}`,
            )
            .join(
              "\n",
            )}\nThe media library at /app/media takes these directly (browser upload handles video and large files, including reels). Acknowledge the skip in one short sentence and take the operator there by calling navigateWorkspace action navigate with surface "media" so they can drop the files in; once uploaded, you can attach them to work items and build carousels from chat. Do not pretend the skipped files are visible to you.`
        : "";
    const pageContextPrompt = await composePageContextSection({
      pagePath,
      contextMode,
      organizationId: membership.organizationId,
    });
    // The brand story of whichever brand this turn is about: the one the work
    // item or intent names, else the one on the page.
    const storyBrandId =
      brand?.id ??
      (pagePath
        ? (await resolvePageContext(pagePath, membership.organizationId)).brand
            ?.id
        : undefined);
    const storyBrand = storyBrandId
      ? await db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.id, storyBrandId),
            eq(brandTable.organizationId, membership.organizationId),
          ),
          columns: { name: true, story: true },
        })
      : undefined;
    const brandStoryPrompt = storyBrand
      ? brandStorySection({
          brandName: storyBrand.name,
          story: storyBrand.story,
        }) + BRAND_STORY_UPKEEP
      : "";

    // Persisted messages are the content truth. The client contributes only its
    // final message: a fresh user turn, approval continuation, or regeneration.
    const incoming = messages[messages.length - 1]!;
    if (incoming.role === "user") {
      incoming.metadata = {
        ...((incoming.metadata ?? {}) as Record<string, unknown>),
        adWorkContext: activeCampaignContext,
        catalogHomeContext: activeCatalogContext ?? null,
        workContext: activeWorkContext,
        brandId: brand?.id,
        contextMode,
      };
    }
    const incomingIdx = persisted.findIndex(
      (row) => row.clientMessageId === incoming.id,
    );
    if (incoming.role === "assistant") {
      if (
        trigger !== "submit-message" ||
        messageId !== incoming.id ||
        incomingIdx !== persisted.length - 1
      ) {
        return Response.json(
          {
            error:
              "This approval was superseded by a later message. Request a fresh approval.",
          },
          { status: 409 },
        );
      }
      const stored = persisted[incomingIdx];
      if (
        !stored ||
        (approvalHasExpired({ createdAt: stored.createdAt, now: requestNow }) &&
          !isApprovalDenial(incoming))
      ) {
        return Response.json(
          { error: "This approval expired. Request a fresh approval." },
          { status: 409 },
        );
      }
      incoming.metadata = stored.message.metadata;
      const continuationError = validateApprovalContinuation(
        stored.message,
        incoming,
      );
      if (continuationError) {
        return Response.json({ error: continuationError }, { status: 409 });
      }
    }
    let history: UIMessage[];
    let staleTailIds: string[] = [];
    if (incomingIdx === -1) {
      if (incoming.role !== "user") {
        return Response.json(
          { error: "New messages must come from the user" },
          { status: 400 },
        );
      }
      history = [...persisted.map((row) => row.message), incoming];
      await db
        .insert(assistantMessageTable)
        .values({
          threadId: thread.id,
          clientMessageId: incoming.id,
          role: incoming.role,
          message: incoming,
        })
        .onConflictDoNothing({
          target: [
            assistantMessageTable.threadId,
            assistantMessageTable.clientMessageId,
          ],
        });
    } else if (inputId && incoming.role === "user") {
      // Explicit queue retry keeps corrections and completed tool receipts in history.
      history = [
        ...persisted.map((row) => row.message),
        {
          id: createId("amsg_retry"),
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please resume the interrupted request. Use the recorded results and subsequent corrections; avoid repeating completed actions.",
            },
            ...(JSON.stringify(incoming.parts) !==
            JSON.stringify(persisted[incomingIdx]!.message.parts)
              ? [
                  {
                    type: "text" as const,
                    text: "The operator edited the queued request. Use this updated request:",
                  },
                  ...incoming.parts,
                ]
              : []),
          ],
        },
      ];
    } else if (incoming.role === "assistant") {
      history = [
        ...persisted.slice(0, incomingIdx).map((row) => row.message),
        incoming,
      ];
      staleTailIds = persisted.slice(incomingIdx + 1).map((row) => row.id);
    } else {
      history = persisted.slice(0, incomingIdx + 1).map((row) => row.message);
      staleTailIds = persisted.slice(incomingIdx + 1).map((row) => row.id);
    }
    const historyMessages = await convertToModelMessages(
      sanitizeForModel(history).slice(-30),
    );

    const sheets: ModelMessage[] = [];
    if (activeAd?.images.length) {
      for (let offset = 0; offset < activeAd.images.length; offset += 16) {
        const batch = activeAd.images.slice(offset, offset + 16);
        const sheet = await contactSheet({
          id: activeAd.ad.id,
          name: activeAd.ad.name,
          url: "",
          photos: batch.map((item) => item.source),
        });
        sheets.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Current ad images. Labels map to: ${JSON.stringify(batch.map((item, index) => ({ label: index + 1, cardId: item.cardId, slide: item.slide, size: item.size })))}`,
            },
            { type: "image", image: sheet.image, mediaType: "image/jpeg" },
          ],
        });
      }
    }

    if (catalogHome?.photos.length) {
      const photos = catalogHome.photos.slice(0, 64);
      for (let offset = 0; offset < photos.length; offset += 16) {
        const batch = photos.slice(offset, offset + 16);
        const sheet = await contactSheet(
          {
            id: catalogHome.home.id,
            name: catalogHome.home.name,
            url: "",
            photos: batch.map((photo) => ({
              url: photo.thumbUrl || photo.url,
            })),
          },
          offset + 1,
        );
        sheets.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `${catalogHome.home.name}, photos ${offset + 1}–${offset + batch.length} of ${catalogHome.photos.length}. Rooms: ${JSON.stringify(batch.map((photo, index) => ({ photo: offset + index + 1, room: photo.room })))}`,
            },
            { type: "image", image: sheet.image, mediaType: "image/jpeg" },
          ],
        });
      }
    }
    const modelMessages = withRequestContext(historyMessages, sheets);

    const context = composeGrowthContext({
      surface: "overview-chat",
      maximumCharacters: 80_000,
      rollingCacheTtl: GROWTH_CONVERSATION_CACHE_TTL,
      sections: [
        { id: "persona", content: OVERVIEW_AGENT_PERSONA, cache: "session" },
        {
          id: "runtime-clock",
          content: runtimeClockSection({
            now: requestNow,
            timeZone: currentUser.timeZone,
          }),
        },
        { id: "surface", content: surfaceContext },
        { id: "page", content: pageContextPrompt },
        { id: "brand-story", content: brandStoryPrompt },
        { id: "intent", content: intentContext },
        { id: "work-item", content: workContextPrompt + catalogHomePrompt },
        { id: "attachment", content: attachmentPrompt },
        { id: "skipped-attachment", content: skippedPrompt },
      ],
    });
    const runId = await startAssistantRun({
      organizationId: membership.organizationId,
      userId: currentUser.id,
      threadId: thread.id,
      surface: "overview-chat",
      model: MODEL,
      contextManifest: context.manifest,
    });
    const runtime = buildGrowthToolRuntime({
      tools: {
        ...NATIVE_TOOLS,
        ...legacyApprovalTools(OVERVIEW_TOOLS, incoming),
      },
      identity: {
        orgId: membership.organizationId,
        userId: currentUser.id,
        threadId: thread.id,
      },
      runId,
      surface: "overview-chat",
      beforeExecute: () => assertChatTurn(claimedThreadId, turnId),
    });

    let streamFailure: string | undefined;
    const steeringInputIds: string[] = [];
    const deadline = AbortSignal.timeout(TURN_DEADLINE_MS);
    const result = await (async () => {
      try {
        return streamText({
          model: anthropic(MODEL),
          messages: [...context.messages, ...modelMessages],
          allowSystemInMessages: true,
          tools: anthropicTools(runtime.tools),
          toolsContext: runtime.toolsContext,
          toolApproval: runtime.toolApproval,
          abortSignal: deadline,
          stopWhen: stepCountIs(20),
          maxOutputTokens: GROWTH_MAX_OUTPUT_TOKENS,
          prepareStep: async ({ messages, stepNumber }) => {
            await assertChatTurn(claimedThreadId, turnId);
            const corrections = await readChatSteering(claimedThreadId, turnId);
            steeringInputIds.push(...corrections.map((message) => message.id));
            return {
              messages: withGrowthRollingCache(
                [...messages, ...(await convertToModelMessages(corrections))],
                growthCacheTtlForStep(stepNumber),
              ),
            };
          },
          onError: ({ error }) => {
            streamFailure = streamErrorMessage(error);
          },
        });
      } catch (error) {
        await failAssistantRun(runId, compactGrowthError(error));
        throw error;
      }
    })();

    return result.toUIMessageStreamResponse({
      // Drain the UI stream too: it owns persistence, including after browser disconnect.
      consumeSseStream: ({ stream }) => {
        after(async () => {
          try {
            await consumeStream({ stream });
          } catch (error) {
            await failAssistantRun(runId, compactGrowthError(error));
            await finishChatTurn(
              claimedThreadId,
              turnId,
              inputId,
              streamErrorMessage(error),
            );
          }
        });
      },
      onError: streamErrorMessage,
      originalMessages: history,
      generateMessageId: () => createId("amsg_ui"),
      onFinish: async ({ messages: updatedMessages, isAborted }) => {
        // An aborted stream can reject its result promises; read them softly.
        const finishReason = await Promise.resolve(result.finishReason).catch(
          () => "error" as const,
        );
        const turnError = deadline.aborted
          ? "This turn hit the time limit. Completed actions are saved; say continue to pick up where it stopped."
          : (streamFailure ??
            (isAborted || finishReason === "length" || finishReason === "error"
              ? "The response ended before completion. Review completed actions before retrying."
              : undefined));
        const reply = updatedMessages
          .slice()
          .reverse()
          .find((message) => message.role === "assistant");
        if (reply) {
          const ids = new Set<string>([
            ...(incoming.role === "assistant"
              ? ((incoming.metadata as { queueInputIds?: string[] } | undefined)
                  ?.queueInputIds ?? [])
              : []),
            ...(inputId ? [inputId] : []),
            ...steeringInputIds,
          ]);
          reply.metadata = {
            ...((reply.metadata ?? {}) as Record<string, unknown>),
            queueInputIds: [...ids],
            queueTurnError: turnError ?? null,
          };
        }
        await finishChatTurn(
          claimedThreadId,
          turnId,
          inputId,
          turnError,
          async (tx) => {
            const base = Date.now();
            await Promise.all(
              updatedMessages.map((message, index) =>
                tx
                  .insert(assistantMessageTable)
                  .values({
                    threadId: thread.id,
                    clientMessageId: message.id,
                    role: message.role,
                    message,
                    createdAt: new Date(base + index),
                  })
                  .onConflictDoUpdate({
                    target: [
                      assistantMessageTable.threadId,
                      assistantMessageTable.clientMessageId,
                    ],
                    set: {
                      role: message.role,
                      message,
                      ...(incoming.role === "assistant" &&
                      message.id === incoming.id
                        ? { createdAt: new Date(base + index) }
                        : {}),
                    },
                  }),
              ),
            );
            if (staleTailIds.length > 0) {
              await tx
                .delete(assistantMessageTable)
                .where(
                  and(
                    eq(assistantMessageTable.threadId, thread.id),
                    inArray(assistantMessageTable.id, staleTailIds),
                  ),
                );
            }
            const firstUserText = updatedMessages
              .find((message) => message.role === "user")
              ?.parts.find((part) => part.type === "text")
              ?.text.trim();
            await tx
              .update(assistantThreadTable)
              .set({
                ...(thread.title === "New session" && firstUserText
                  ? { title: firstUserText.slice(0, 72) }
                  : {}),
                pinnedBrandId: brand?.id ?? thread.pinnedBrandId,
                activeContentPostId:
                  activeWorkContext?.contentPostId ??
                  thread.activeContentPostId,
                updatedAt: new Date(),
              })
              .where(eq(assistantThreadTable.id, thread.id));
          },
        );
        if (turnError) {
          await failAssistantRun(
            runId,
            compactGrowthError(new Error(turnError)),
          );
          return;
        }
        const steps = await result.steps;
        await completeAssistantRun(runId, {
          persistedMessages: updatedMessages.length,
          steps: steps.length,
          usage: summarizeGrowthUsage(await result.usage, steps),
        });
      },
    });
  };
  try {
    const response = await executeTurn();
    if (!response.ok)
      await finishChatTurn(
        claimedThreadId,
        turnId,
        inputId,
        "The request was rejected. Review the message before retrying.",
      );
    return response;
  } catch (error) {
    await finishChatTurn(
      claimedThreadId,
      turnId,
      inputId,
      streamErrorMessage(error),
    );
    return Response.json(
      { error: streamErrorMessage(error) },
      { status: error instanceof ChatTurnError ? error.status : 500 },
    );
  }
}
