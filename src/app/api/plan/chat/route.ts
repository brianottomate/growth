import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { PLAN_AGENT_PERSONA } from "@/server/ai/plan-agent/persona";
import { buildPlanTools } from "@/server/ai/plan-agent/tools";

/**
 * /plan chat agent — the repo's reference tool-use agent.
 *
 * The whole pattern, in one file: resolve the caller's org, build an
 * org-scoped tool registry, and run `streamText` with those tools in a
 * multi-step loop (`stopWhen: stepCountIs`). The model converses in free text
 * and calls tools as it needs them; `toUIMessageStreamResponse()` streams both
 * the text and the tool parts to the client `useChat`.
 *
 * Deliberately minimal: no persistence, no approvals (every tool is read-only).
 * See homi's collection onboarding / capient's IQ for the fuller version
 * (DB-backed history, per-tool needsApproval, prompt caching).
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

  const { messages, brandId, brandName } = (await req.json()) as {
    messages: UIMessage[];
    brandId?: string;
    brandName?: string;
  };

  // The /plan UI knows which brand is selected; pin it so the agent doesn't
  // have to guess (it can still switch if the user explicitly asks).
  const system = brandId
    ? `${PLAN_AGENT_PERSONA}\n\n# Selected brand\nThe operator has selected "${brandName ?? brandId}" (brandId: ${brandId}). Use this brandId for draftBlueprint unless they clearly ask for a different brand.`
    : PLAN_AGENT_PERSONA;

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(MODEL),
    system,
    messages: modelMessages,
    tools: buildPlanTools({
      orgId: membership.organizationId,
      userId: session.user.id,
    }),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
