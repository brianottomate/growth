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
  contentPostTable,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { OVERVIEW_AGENT_PERSONA } from "@/server/ai/overview-agent/persona";
import { OVERVIEW_CAPABILITIES, toAiTools } from "@/server/ai/capabilities";
import type {
  AssistantIntent,
  ContentWorkContext,
} from "@/lib/assistant-events";
import { isOwnedChatImageUrl } from "@/lib/chat-attachment";

/**
 * /overview chat agent — a general growth back-office assistant.
 *
 * Same shape as the /plan agent route (resolve org → build org-scoped read-only
 * tools → streamText in a multi-step loop), but with a broad orientation
 * persona instead of the blueprint-drafting one. This is the seed of a future
 * home screen / MCP surface; keep it minimal and let the tool registry grow.
 */
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

function sanitizeForModel(history: UIMessage[]) {
  return history
    .map((message, index) => {
      if (message.role !== "assistant" || index === history.length - 1) {
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

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    columns: { organizationId: true },
  });
  if (!membership?.organizationId) {
    return new Response("No organization", { status: 403 });
  }

  const {
    messages,
    surface,
    brandId,
    intent: rawIntent,
    assistantIntent,
    workContext,
    chatAttachment,
    threadId,
  } = (await req.json()) as {
    messages: UIMessage[];
    surface?: "overview" | "create" | "next";
    brandId?: string;
    intent?: string;
    assistantIntent?: AssistantIntent;
    workContext?: ContentWorkContext;
    chatAttachment?: { url?: string; mediaType?: string };
    threadId?: string;
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
  const requestedBrandId =
    activeWorkContext?.brandId ?? assistantIntent?.brandId ?? brandId;
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
      ? `\n\n# Current surface\nThe operator is in the unified Next conversation${brand ? ` for ${brand.name} (brandId: ${brand.id})` : ""}${intent ? ` with intent \"${intent}\"` : ""}. The default operating horizon is the next 14 days. Treat questions, pasted images, links, and rough thoughts as one continuous iteration loop. First establish readiness with nextForBrand when a brand is known. Do not pretend this is an editing studio. Prefer the smallest useful action, keep suggestions to at most three and usually one, follow each write tool's approval contract, then point or navigate the operator to the existing content, schedule, calendar, media, or review surface where the result belongs. When the creative direction is genuinely ready for production, save a provider-neutral production packet. Copying that packet into Claude Design, ChatGPT, a video editor, or an agency workflow is a first-class outcome; Fal is only an optional experiment that consumes the same reviewed packet.`
      : "";
  const intentContext =
    assistantIntent?.type === "plan_two_weeks" && brand
      ? `\n\n# Triggered intent\nThe operator clicked Plan next two weeks on the Content surface for ${brand.name}. Call nextForBrand first, then previewTwoWeekSlots only when readiness and the existing 14-day pipeline indicate it is useful. Create slots only after the operator explicitly agrees to the preview; their conversational agreement is sufficient and must not be followed by a second confirmation.`
      : assistantIntent?.type === "build_channel_strategy" && brand
        ? `\n\n# Triggered intent\nThe operator clicked Build channel strategy for ${brand.name}. Call nextForBrand first. Propose a modest starter content mix and platform-appropriate cadence only for genuinely missing configuration. Explain the complete proposal clearly, ask for one conversational go-ahead, then create the agreed missing mix and channel cadences without redundant approval cards. Do not overwrite existing targets; use the approval-gated update tools only after explaining an explicit before/after change.`
        : assistantIntent?.type === "shape_content_structure" && brand
          ? `\n\n# Triggered intent\nThe operator opened the content-structure conversation for ${brand.name}. Call getContentStrategy first. Then help them reason about pillars, series, canonical ideas, and any pending retrospective groupings using the three-operation model in your persona. Start with a concise read of what already exists and one useful question or concrete proposal. Do not write structure until the operator has discussed and agreed to the exact change; the write tool will then show its approval card.`
          : assistantIntent?.type === "plan_email"
            ? `\n\n# Triggered intent\nThe operator wants to plan a newsletter issue or one-off blast${brand ? ` for ${brand.name}` : ""}. First distinguish a recurring newsletter.broadcast from a cadence-independent newsletter.blast. Talk through the premise, pillar or series relationship, CTA, and Wander Growth content-calendar timing. Use createEmailSlot only after the operator agrees to the exact empty slot. Do not generate the full email during batch or cadence planning; call generateEmailDraft only later for one individually selected slot.`
            : "";
  const workContextPrompt =
    activeWorkContext && brand
      ? `\n\n# Active content work item\nThe operator is working on “${activeWorkContext.contentTitle}” (contentPostId: ${activeWorkContext.contentPostId}) for ${brand.name}.${activeWorkContext.platformPostId ? ` Focus the ${activeWorkContext.platform ?? "selected"} rendering (platformPostId: ${activeWorkContext.platformPostId}).` : ""} Call getContentWorkItem before making claims about readiness or current copy. Prefer concrete edits over suggestion lists. Use approval-gated content tools for writes.`
      : "";
  const safeAttachment =
    chatAttachment?.url &&
    chatAttachment.mediaType?.startsWith("image/") &&
    isOwnedChatImageUrl(chatAttachment.url, session.user.id)
      ? chatAttachment
      : null;
  const attachmentPrompt =
    safeAttachment && activeWorkContext
      ? `\n\n# Current pasted image\nThe operator attached an image stored at ${safeAttachment.url} (${safeAttachment.mediaType}). You can analyze it visually now. If the operator asks to use, save, or attach it to the active work item, call attachChatImageToContent with this exact URL. Do not save it merely because it was pasted.`
      : "";

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

  const result = streamText({
    model: anthropic(MODEL),
    system: `${OVERVIEW_AGENT_PERSONA}${surfaceContext}${intentContext}${workContextPrompt}${attachmentPrompt}`,
    messages: modelMessages,
    tools: toAiTools(OVERVIEW_CAPABILITIES, {
      orgId: membership.organizationId,
      userId: session.user.id,
      threadId: thread.id,
    }),
    stopWhen: stepCountIs(8),
  });

  // Keep the tool loop alive when the browser navigates away. Accepted writes
  // and the final answer will still be waiting in this durable session.
  void (async () => {
    try {
      await result.consumeStream();
    } catch (error) {
      console.error("[overview-chat] stream drain failed", error);
    }
  })();

  return result.toUIMessageStreamResponse({
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
    },
  });
}
