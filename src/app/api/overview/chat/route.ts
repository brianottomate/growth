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
import { OVERVIEW_AGENT_PERSONA } from "@/server/ai/overview-agent/persona";
import { OVERVIEW_CAPABILITIES, toAiTools } from "@/server/ai/capabilities";

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

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(MODEL),
    system: OVERVIEW_AGENT_PERSONA,
    messages: modelMessages,
    tools: toAiTools(OVERVIEW_CAPABILITIES, {
      orgId: membership.organizationId,
      userId: session.user.id,
    }),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
