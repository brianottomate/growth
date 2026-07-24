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
import { PLAN_TOOLS } from "@/server/ai/capabilities";
import { composeGrowthContext } from "@/server/ai/kernel/context";
import { compactGrowthError } from "@/server/ai/kernel/errors";
import {
  completeAssistantRun,
  failAssistantRun,
  startAssistantRun,
} from "@/server/ai/kernel/journal";
import { buildGrowthToolRuntime } from "@/server/ai/kernel/runtime";

/**
 * /plan is a deterministic product-surface projection of the same canonical
 * definitions used by overview chat and MCP. It remains ephemeral, but runs
 * through the shared policy, access-check, receipt, and error pipeline.
 */
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";
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
  const selectedBrand = brandId
    ? `The operator has selected "${brandName ?? brandId}" (brandId: ${brandId}). Use this brandId for planningRead.draftMomentBlueprint unless they clearly ask for a different brand.`
    : "";

  const modelMessages = await convertToModelMessages(messages);
  const context = composeGrowthContext({
    surface: "plan-chat",
    maximumCharacters: 24_000,
    sections: [
      { id: "persona", content: PLAN_AGENT_PERSONA, cache: "session" },
      { id: "selected-brand", content: selectedBrand },
    ],
  });
  const runId = await startAssistantRun({
    organizationId: membership.organizationId,
    userId: session.user.id,
    surface: "plan-chat",
    model: MODEL,
    contextManifest: context.manifest,
  });
  const runtime = buildGrowthToolRuntime({
    tools: PLAN_TOOLS,
    identity: {
      orgId: membership.organizationId,
      userId: session.user.id,
    },
    runId,
    surface: "plan-chat",
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
        stopWhen: stepCountIs(8),
      });
    } catch (error) {
      await failAssistantRun(runId, compactGrowthError(error));
      throw error;
    }
  })();

  void (async () => {
    try {
      await result.consumeStream();
    } catch (error) {
      await failAssistantRun(runId, compactGrowthError(error));
      console.error("[plan-chat] stream drain failed", error);
    }
  })();

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages: updatedMessages }) => {
      await completeAssistantRun(runId, {
        persistedMessages: 0,
        streamedMessages: updatedMessages.length,
      });
    },
  });
}
