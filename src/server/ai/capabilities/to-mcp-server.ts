import "server-only";

import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { anthropic } from "@ai-sdk/anthropic";
import {
  generateText,
  stepCountIs,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { userTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { composeGrowthContext } from "../kernel/context";
import { compactGrowthError } from "../kernel/errors";
import {
  completeAssistantRun,
  failAssistantRun,
  startAssistantRun,
} from "../kernel/journal";
import { GROWTH_MAX_OUTPUT_TOKENS } from "../kernel/limits";
import {
  GROWTH_TOOL_LOOP_CACHE_TTL,
  withGrowthRollingCache,
} from "../kernel/prompt-cache";
import { growthActionPolicies } from "../kernel/policy";
import { buildGrowthToolRuntime } from "../kernel/runtime";
import { runtimeClockSection } from "../kernel/runtime-clock";
import { summarizeGrowthUsage } from "../kernel/usage";
import type { GrowthExecutionContext, GrowthTool } from "../kernel/tool";
import { socialPostPreviewOutputSchema } from "./social-post-preview";
import { SOCIAL_POST_PREVIEW_URI } from "@/server/mcp/social-post-preview-ui";

type ToolContext = { http?: { authInfo?: AuthInfo } };

export function identityFromMcpContext(context: ToolContext) {
  const values = context.http?.authInfo?.extra as
    | { orgId?: unknown; userId?: unknown }
    | undefined;
  if (typeof values?.orgId !== "string" || typeof values.userId !== "string") {
    throw new Error("The MCP token is not attached to a Growth organization.");
  }
  return { orgId: values.orgId, userId: values.userId };
}

function mcpContextManifest() {
  return {
    surface: "mcp" as const,
    characters: 0,
    cachedPrefixCharacters: 0,
    sections: [],
  };
}

function isCapabilityError(value: unknown): value is {
  ok: false;
  error: { message: string };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === false &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

function capabilityFailure(error: unknown, action?: string) {
  // A malformed call is the one failure the caller can fix on its own, so it
  // gets the field paths back rather than a sentence about validation. Paths
  // and Zod's own messages only: the values are the caller's, and echoing them
  // puts organization data into a transport log for no benefit.
  if (error instanceof z.ZodError) {
    return {
      ok: false as const,
      ...(action ? { action } : {}),
      error: {
        code: "invalid_tool_input" as const,
        message: action
          ? `${action} input is invalid`
          : "The tool input is invalid",
        suggestedAction: "Fix the listed fields and call again.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }
  const compact = compactGrowthError(error);
  return {
    ok: false as const,
    ...(action ? { action } : {}),
    error: {
      code: compact.code,
      message: compact.error,
      suggestedAction: compact.suggestedAction,
    },
  };
}

const invokeGrowthInput = z.object({
  request: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe("The growth workspace question or operation to complete."),
});

const INVOKE_GROWTH_PERSONA = `You are Growth, invoked as one coarse-grained MCP tool.
Use the detailed Growth workspace tools to answer the request with live organization data.
You may read, draft, plan, and apply authorized workspace changes. Prefer acting over producing another suggestion layer when the request is clear.
Report exactly what changed and include the canonical Growth route when useful.
You do not have open-world web research on this surface. Never invent workspace state.`;

function registerInvokeGrowth(server: McpServer, toolSet: ToolSet) {
  server.registerTool(
    "invoke_growth",
    {
      title: "Invoke Growth",
      description:
        "Delegate a natural-language growth workspace question or operation to Growth. It can use the same organization-scoped read and write tools exposed individually by this MCP.",
      inputSchema: invokeGrowthInput.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      let runId: string | undefined;
      try {
        const requestNow = new Date();
        const identity = identityFromMcpContext(extra);
        const user = await db.query.userTable.findFirst({
          where: eq(userTable.id, identity.userId),
          columns: { timeZone: true },
        });
        const context = composeGrowthContext({
          surface: "invoke-growth",
          maximumCharacters: 40_000,
          sections: [
            {
              id: "persona",
              content: INVOKE_GROWTH_PERSONA,
              cache: "session",
            },
            {
              id: "runtime-clock",
              content: runtimeClockSection({
                now: requestNow,
                timeZone: user?.timeZone,
              }),
            },
          ],
        });
        runId = await startAssistantRun({
          organizationId: identity.orgId,
          userId: identity.userId,
          surface: "invoke-growth",
          model: "claude-sonnet-5",
          contextManifest: context.manifest,
        });
        const runtime = buildGrowthToolRuntime({
          tools: toolSet,
          identity,
          runId,
          surface: "invoke-growth",
        });
        const result = await generateText({
          model: anthropic("claude-sonnet-5"),
          messages: [
            ...context.messages,
            { role: "user", content: input.request },
          ],
          allowSystemInMessages: true,
          tools: runtime.tools,
          toolsContext: runtime.toolsContext,
          toolApproval: runtime.toolApproval,
          stopWhen: stepCountIs(8),
          maxOutputTokens: GROWTH_MAX_OUTPUT_TOKENS,
          prepareStep: ({ messages }) => ({
            messages: withGrowthRollingCache(
              messages,
              GROWTH_TOOL_LOOP_CACHE_TTL,
            ),
          }),
        });
        await completeAssistantRun(runId, {
          finishReason: result.finishReason,
          steps: result.steps.length,
          usage: summarizeGrowthUsage(result.usage, result.steps),
        });
        return {
          content: [{ type: "text" as const, text: result.text }],
          structuredContent: {
            response: result.text,
            finishReason: result.finishReason,
            steps: result.steps.length,
          },
        };
      } catch (error) {
        const compact = compactGrowthError(error);
        if (runId) await failAssistantRun(runId, compact);
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify(compact) }],
          structuredContent: { ...compact },
        };
      }
    },
  );
}

/** Project native AI SDK tools onto the authenticated OAuth MCP surface. */
export function registerMcpTools(server: McpServer, toolSet: ToolSet) {
  for (const [name, definition] of Object.entries(toolSet)) {
    const policies = Object.values(
      (
        growthActionPolicies as Record<
          string,
          Record<
            string,
            {
              consequence: string;
              reversible: boolean;
              idempotent: boolean;
            }
          >
        >
      )[name] ?? {},
    );
    const nativeDefinition = definition as GrowthTool<unknown, unknown>;
    const inputSchema = nativeDefinition.transportInputSchema;
    const rendersSocialPostPreview = name === "renderSocialPosts";
    server.registerTool(
      name,
      {
        title: name,
        description:
          typeof definition.description === "string"
            ? definition.description
            : undefined,
        inputSchema,
        ...(rendersSocialPostPreview
          ? { outputSchema: socialPostPreviewOutputSchema }
          : {}),
        annotations: {
          readOnlyHint: policies.every((policy) =>
            policy.consequence.endsWith("read"),
          ),
          destructiveHint: policies.some(
            (policy) =>
              !policy.reversible && !policy.consequence.endsWith("read"),
          ),
          idempotentHint: policies.every((policy) => policy.idempotent),
          openWorldHint: name === "researchRead",
        },
        ...(rendersSocialPostPreview
          ? {
              _meta: {
                ui: {
                  resourceUri: SOCIAL_POST_PREVIEW_URI,
                  visibility: ["model", "app"],
                },
                "openai/outputTemplate": SOCIAL_POST_PREVIEW_URI,
                "openai/toolInvocation/invoking": "Rendering social posts",
                "openai/toolInvocation/invoked": "Social posts ready",
              },
            }
          : {}),
      },
      async (input, extra) => {
        let runId: string | undefined;
        try {
          const validatedInput = nativeDefinition.validationSchema.parse(input);
          const identity = identityFromMcpContext(extra);
          const manifest = mcpContextManifest();
          runId = await startAssistantRun({
            organizationId: identity.orgId,
            userId: identity.userId,
            surface: "mcp",
            contextManifest: manifest,
          });
          const runtime = buildGrowthToolRuntime({
            tools: { [name]: definition },
            identity,
            runId,
            surface: "mcp",
          });
          const executable = runtime.tools[name] as Tool<
            unknown,
            unknown,
            GrowthExecutionContext
          >;
          if (!executable.execute) throw new Error(`${name} is not executable`);
          const options: ToolExecutionOptions<GrowthExecutionContext> = {
            toolCallId: createId("mcp_call"),
            messages: [],
            context: runtime.context,
          };
          const output = await executable.execute(validatedInput, options);
          if (
            typeof output === "object" &&
            output !== null &&
            Symbol.asyncIterator in output
          ) {
            throw new Error("Streaming MCP tool outputs are not supported");
          }
          if (isCapabilityError(output)) {
            await failAssistantRun(
              runId,
              compactGrowthError(output.error.message),
            );
          } else {
            await completeAssistantRun(runId, { toolName: name });
          }
          return {
            ...(isCapabilityError(output) ? { isError: true } : {}),
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent:
              output && typeof output === "object"
                ? output
                : { result: output },
          };
        } catch (error) {
          const compact = compactGrowthError(error);
          if (runId) await failAssistantRun(runId, compact);
          const failure = capabilityFailure(
            error,
            typeof input === "object" &&
              input !== null &&
              "action" in input &&
              typeof input.action === "string"
              ? input.action
              : undefined,
          );
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(failure) }],
            structuredContent: failure,
          };
        }
      },
    );
  }
  registerInvokeGrowth(server, toolSet);
}
