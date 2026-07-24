import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { renderPlaybookIndex } from "@/server/ai/playbooks";
import { loadMentionSparContext } from "@/server/ai/spar-agent/context";
import { SPAR_AGENT_PERSONA } from "@/server/ai/spar-agent/persona";
import { buildSparTools } from "@/server/ai/spar-agent/tools";
import { getSession } from "@/server/better-auth/server";

/**
 * /listen spar agent — a mention-scoped sparring partner. Same shape as the
 * /overview route (streamText + tools, multi-step), but the system prompt is
 * persona + playbook index + a VOLATILE block describing this one mention and
 * its subreddit profile (capient's stable-persona / volatile-context split).
 * Stateless: the client (useChat) holds the conversation and resends it, which
 * is also how the needsApproval round-trip for recordDecision resumes.
 */
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { messages, mentionId } = (await req.json()) as {
    messages: UIMessage[];
    mentionId?: string;
  };
  if (!mentionId) return new Response("mentionId required", { status: 400 });

  const sparContext = await loadMentionSparContext(mentionId);
  if (!sparContext) return new Response("Mention not found", { status: 404 });

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(MODEL),
    system: `${SPAR_AGENT_PERSONA}\n\n${renderPlaybookIndex()}\n\n${sparContext.contextText}`,
    messages: modelMessages,
    tools: buildSparTools({
      mentionId,
      userId: session.user.id,
      mention: sparContext.mention,
    }),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
