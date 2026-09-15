import { streamErrorMessage } from "@/server/ai/kernel/stream-error";

import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  isToolUIPart,
  stepCountIs,
  streamText,
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
import { OVERVIEW_TOOLS } from "@/server/ai/capabilities";
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
  validateApprovalContinuation,
} from "@/server/ai/kernel/approval-continuation";
import { runtimeClockSection } from "@/server/ai/kernel/runtime-clock";
import type {
  AssistantIntent,
  AdCampaignWorkContext,
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
export const maxDuration = 300;

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

/** Which step of the campaign page the operator asked from, as a first move. */
function campaignFocusPrompt(focus: AdCampaignWorkContext["focus"]) {
  switch (focus) {
    case "photos":
      return "\n\nThe operator asked from the Photos step: they want images in this campaign's pool. Check mediaLibraryRead.list for the brand first; adsWrite.draftAdsFromHomes both imports their listing photos and renders cards from them, and adsWrite.setCreativePool sets the pool from library assets.";
    case "ads":
      return "\n\nThe operator asked from the Ads step: they want ads drafted or improved. For a brand with a WanderOS site, adsWrite.draftAdsFromHomes is the fast path (cards per home, one static, one carousel); otherwise adsWrite.draftAd with pool media. Write the copy yourself, do not ask them for it.";
    case "audiences":
      return "\n\nThe operator asked from the Audiences step. Broad with a geography is the default that leaves the learning phase at these budgets; propose one or two audiences with a reason each, then adsWrite.addAudience once they agree.";
    case "platforms":
      return "\n\nThe operator asked from the Platforms step: planning a platform (adsWrite.planPlatform), setting its budget, or pushing. Read adsRead.listDestinations before naming any account.";
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

  const activeOrganizationId = session.session.activeOrganizationId;
  const memberships = await db.query.memberTable.findMany({
    where: activeOrganizationId
      ? and(
          eq(memberTable.userId, session.user.id),
          eq(memberTable.organizationId, activeOrganizationId),
        )
      : eq(memberTable.userId, session.user.id),
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

  const {
    messages,
    surface,
    brandId,
    intent: rawIntent,
    assistantIntent,
    workContext,
    campaignContext,
    chatAttachment,
    chatAttachments,
    skippedAttachments,
    threadId,
    pagePath,
    trigger,
    messageId,
  } = (await req.json()) as {
    messages: UIMessage[];
    surface?: "overview" | "create" | "next";
    brandId?: string;
    intent?: string;
    assistantIntent?: AssistantIntent;
    workContext?: ContentWorkContext;
    campaignContext?: AdCampaignWorkContext;
    chatAttachment?: { url?: string; mediaType?: string; fileName?: string };
    chatAttachments?: {
      url?: string;
      mediaType?: string;
      fileName?: string;
    }[];
    skippedAttachments?: { name?: string; sizeMb?: number; reason?: string }[];
    threadId?: string;
    pagePath?: string;
    trigger?: "submit-message" | "regenerate-message";
    messageId?: string;
  };
  if (!threadId || messages.length === 0) {
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
        eq(assistantThreadTable.createdBy, session.user.id),
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

  const requestedWorkContext =
    assistantIntent?.type === "work_content_post"
      ? assistantIntent
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
  const requestedCampaignContext =
    assistantIntent?.type === "work_ad_campaign"
      ? assistantIntent
      : campaignContext;
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
        }
      : null;

  const requestedBrandId =
    activeCampaignContext?.brandId ??
    activeWorkContext?.brandId ??
    (assistantIntent && "brandId" in assistantIntent
      ? assistantIntent.brandId
      : null) ??
    brandId;
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
  const intentContext =
    assistantIntent?.type === "plan_two_weeks" && brand
      ? `\n\n# Triggered intent\nThe operator clicked Plan next two weeks on the Content surface for ${brand.name}. Call brandRead action next first, then planningRead action previewSlots only when readiness and the existing 14-day pipeline indicate it is useful. Create slots only after the operator explicitly agrees to the preview; their conversational agreement is sufficient and must not be followed by a second confirmation.`
      : assistantIntent?.type === "build_channel_strategy" && brand
        ? `\n\n# Triggered intent\nThe operator clicked Build channel strategy for ${brand.name}. Call brandRead action next first. Propose a modest starter content mix and platform-appropriate cadence only for genuinely missing configuration. Explain the complete proposal clearly, ask for one conversational go-ahead, then use strategyWrite for the agreed missing mix and channel cadences. Do not overwrite existing targets without explaining an explicit before/after change.`
        : assistantIntent?.type === "shape_content_structure" && brand
          ? `\n\n# Triggered intent\nThe operator opened the content-structure conversation for ${brand.name}. Call contentStrategyRead action get first. Then help them reason about pillars, series, canonical ideas, and any pending retrospective groupings using the three-operation model in your persona. Start with a concise read of what already exists and one useful question or concrete proposal. If they are on a specific series page or ask to map its first posts, assess the editorial promise, cadence, first two distinct ideas, channel renderings, and dates; make the agreed workspace changes directly and finish with only the remaining gaps. Once the operator agrees to the exact change, write it directly and report what changed.`
          : assistantIntent?.type === "start_client_campaign" && brand
            ? `\n\n# Triggered intent\nThe operator clicked Start campaign in chat for ${brand.name} (brandId ${brand.id}). Call playbookRead action read with id client-first-campaign first, then follow its steps in order, reporting each step in one line as it lands. Stop where the playbook stops: never push or start delivery from this intent.`
            : assistantIntent?.type === "design_ad_preview" && brand
              ? `\n\n# Triggered intent\nThe operator clicked Design in chat on the Ad previews section for ${brand.name} (brandId ${brand.id}). Call playbookRead action read with id brand-ad-preview first, then follow its steps in order, reporting each step in one line as it lands. It ends with the card saved onto the brand and the operator taken to the brand page; nothing is pushed anywhere.`
              : assistantIntent?.type === "define_personas" && brand
                ? `\n\n# Triggered intent\nThe operator clicked Define personas for ${brand.name}. Call personaRead action list and brandRead action getMap first. From the brand's site, homes and location, propose two or three personas (the durable "who": who books these homes, why, and when), each with a name, a one-line description, age ranges and geographies. Show the proposal and ask for one conversational go-ahead, then create them with personaWrite. Do not create more than three, and do not invent facts the brand does not show.`
                : assistantIntent?.type === "set_up_client"
                  ? `\n\n# Triggered intent\nThe operator asked to set up ${assistantIntent.website} as a client. Call playbookRead action read with id new-client-setup first, then follow its steps in order with the tools it names, reporting each step in one line as it lands. Stop where the playbook stops: never push or start delivery from this intent.`
                  : assistantIntent?.type === "plan_email"
                    ? `\n\n# Triggered intent\nThe operator wants to plan a newsletter issue or one-off blast${brand ? ` for ${brand.name}` : ""}. First distinguish a recurring newsletter.broadcast from a cadence-independent newsletter.blast. Talk through the premise, pillar or series relationship, CTA, and Growth content-calendar timing. Use emailWrite action createSlot only after the operator agrees to the exact empty slot. Do not generate the full email during batch or cadence planning; use action generateDraft only later for one individually selected slot.`
                    : "";
  const campaignContextPrompt =
    activeCampaignContext && brand
      ? `\n\n# Active ad campaign\nThe operator is working on the campaign “${activeCampaignContext.campaignName}” (campaignId: ${activeCampaignContext.campaignId}) for ${brand.name}. Call adsRead.openCampaign first so you are working from its current state, not from earlier in this conversation.\n\nIt is a first-party campaign: ads and ad sets live on it, and per-platform campaigns exist only once it is pushed. Local edits touch no provider: adsWrite.draftAd adds an ad, adsWrite.addAdSet adds an ad set (audience and budget live there; omitting both audience fields means broad, which is often right), adsWrite.setCreativePool sets the shared images, and adsWrite.setGoogleSettings is required before any Google push.\n\nadsWrite.push creates the campaign tree PAUSED, so it cannot spend; adsWrite.setDelivery with status active is what starts spend on the client's account. Both ask the operator to approve before they run. Offer them when the campaign looks ready, and run them only when the operator asks, never unprompted. Call adsRead.listDestinations for account ids rather than guessing them. Prefer concrete copy over suggestion lists.${campaignFocusPrompt(activeCampaignContext.focus)}`
      : "";
  const workContextPrompt =
    campaignContextPrompt +
    (activeWorkContext && brand
      ? `\n\n# Active content work item\nThe operator is working on “${activeWorkContext.contentTitle}” (contentPostId: ${activeWorkContext.contentPostId}) for ${brand.name}.${activeWorkContext.platformPostId ? ` Focus the ${activeWorkContext.platform ?? "selected"} rendering (platformPostId: ${activeWorkContext.platformPostId}).` : ""} Call contentRead action getWorkItem before making claims about readiness or current copy. Prefer concrete edits over suggestion lists, and apply authorized writes directly.`
      : "");
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
          !isOwnedChatAttachmentUrl(attachment.url, session.user.id) ||
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
    organizationId: membership.organizationId,
  });

  // Persisted messages are the content truth. The client contributes only its
  // final message: a fresh user turn, approval continuation, or regeneration.
  const persisted = await db.query.assistantMessageTable.findMany({
    where: eq(assistantMessageTable.threadId, thread.id),
    orderBy: [
      asc(assistantMessageTable.createdAt),
      asc(assistantMessageTable.id),
    ],
  });
  const incoming = messages[messages.length - 1]!;
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
      approvalHasExpired({ createdAt: stored.createdAt, now: requestNow })
    ) {
      return Response.json(
        { error: "This approval expired. Request a fresh approval." },
        { status: 409 },
      );
    }
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
  const modelMessages = await convertToModelMessages(
    sanitizeForModel(history).slice(-30),
  );

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
          timeZone: session.user.timeZone,
        }),
      },
      { id: "surface", content: surfaceContext },
      { id: "page", content: pageContextPrompt },
      { id: "intent", content: intentContext },
      { id: "work-item", content: workContextPrompt },
      { id: "attachment", content: attachmentPrompt },
      { id: "skipped-attachment", content: skippedPrompt },
    ],
  });
  const runId = await startAssistantRun({
    organizationId: membership.organizationId,
    userId: session.user.id,
    threadId: thread.id,
    surface: "overview-chat",
    model: MODEL,
    contextManifest: context.manifest,
  });
  const runtime = buildGrowthToolRuntime({
    tools: OVERVIEW_TOOLS,
    identity: {
      orgId: membership.organizationId,
      userId: session.user.id,
      threadId: thread.id,
    },
    runId,
    surface: "overview-chat",
  });

  const result = await (async () => {
    try {
      return streamText({
        model: anthropic(MODEL),
        messages: [...context.messages, ...modelMessages],
        allowSystemInMessages: true,
        tools: runtime.tools,
        toolsContext: runtime.toolsContext,
        toolApproval: runtime.toolApproval,
        stopWhen: stepCountIs(20),
        maxOutputTokens: GROWTH_MAX_OUTPUT_TOKENS,
        prepareStep: ({ messages, stepNumber }) => ({
          messages: withGrowthRollingCache(
            messages,
            growthCacheTtlForStep(stepNumber),
          ),
        }),
      });
    } catch (error) {
      await failAssistantRun(runId, compactGrowthError(error));
      throw error;
    }
  })();

  // Keep the tool loop alive when the browser navigates away. Accepted writes
  // and the final answer will still be waiting in this durable session.
  void (async () => {
    try {
      await result.consumeStream();
    } catch (error) {
      await failAssistantRun(runId, compactGrowthError(error));
      console.error("[overview-chat] stream drain failed", error);
    }
  })();

  return result.toUIMessageStreamResponse({
    onError: streamErrorMessage,
    originalMessages: history,
    generateMessageId: () => createId("amsg_ui"),
    onFinish: async ({ messages: updatedMessages }) => {
      if (updatedMessages.length === 0) return;
      const base = Date.now();
      await Promise.all(
        updatedMessages.map((message, index) =>
          db
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
              set: { role: message.role, message },
            }),
        ),
      );
      if (staleTailIds.length > 0) {
        await db
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
      await db
        .update(assistantThreadTable)
        .set({
          ...(thread.title === "New session" && firstUserText
            ? { title: firstUserText.slice(0, 72) }
            : {}),
          pinnedBrandId: brand?.id ?? thread.pinnedBrandId,
          activeContentPostId:
            activeWorkContext?.contentPostId ?? thread.activeContentPostId,
          updatedAt: new Date(),
        })
        .where(eq(assistantThreadTable.id, thread.id));
      const steps = await result.steps;
      await completeAssistantRun(runId, {
        persistedMessages: updatedMessages.length,
        steps: steps.length,
        usage: summarizeGrowthUsage(await result.usage, steps),
      });
    },
  });
}
