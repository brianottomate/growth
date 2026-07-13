import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { and, eq, isNull } from "drizzle-orm";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, contentPostTable, memberTable } from "@/server/db/schema";
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
  } = (await req.json()) as {
    messages: UIMessage[];
    surface?: "overview" | "create" | "next";
    brandId?: string;
    intent?: string;
    assistantIntent?: AssistantIntent;
    workContext?: ContentWorkContext;
    chatAttachment?: { url?: string; mediaType?: string };
  };
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
      ? `\n\n# Current surface\nThe operator is in the unified Next conversation${brand ? ` for ${brand.name} (brandId: ${brand.id})` : ""}${intent ? ` with intent \"${intent}\"` : ""}. The default operating horizon is the next 14 days. Treat questions, pasted images, links, and rough thoughts as one continuous iteration loop. First establish readiness with nextForBrand when a brand is known. Do not pretend this is an editing studio. Prefer the smallest useful action, keep suggestions to at most three and usually one, execute only approval-gated writes, then point or navigate the operator to the existing content, schedule, calendar, media, or review surface where the result belongs.`
      : "";
  const intentContext =
    assistantIntent?.type === "plan_two_weeks" && brand
      ? `\n\n# Triggered intent\nThe operator clicked Plan next two weeks on the Content surface for ${brand.name}. Call nextForBrand first, then previewTwoWeekSlots only when readiness and the existing 14-day pipeline indicate it is useful. Do not create slots without the approval-gated generateTwoWeekSlots call.`
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

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(MODEL),
    system: `${OVERVIEW_AGENT_PERSONA}${surfaceContext}${intentContext}${workContextPrompt}${attachmentPrompt}`,
    messages: modelMessages,
    tools: toAiTools(OVERVIEW_CAPABILITIES, {
      orgId: membership.organizationId,
      userId: session.user.id,
    }),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
