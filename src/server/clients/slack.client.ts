import { env, envSelect } from "@/env";

// =====================================================
// WEBHOOK CONFIGURATION
// =====================================================

// Webhook URLs per environment
// TODO: Update with your actual Slack webhook URLs
const SLACK_WEBHOOK_URL = envSelect({
  prod: "https://hooks.slack.com/services/YOUR_PROD_WEBHOOK",
  test: "https://hooks.slack.com/services/YOUR_TEST_WEBHOOK",
});

// Environment label for messages
const ENV_LABEL = envSelect({
  prod: "🟢 prod",
  test: "🔵 dev/staging",
});

// =====================================================
// MESSAGE TYPES
// =====================================================

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

interface SlackBlock {
  type: "section" | "divider" | "context";
  text?: {
    type: "mrkdwn" | "plain_text";
    text: string;
  };
  fields?: {
    type: "mrkdwn" | "plain_text";
    text: string;
  }[];
  elements?: {
    type: "mrkdwn" | "plain_text";
    text: string;
  }[];
}

// =====================================================
// CORE SEND FUNCTION
// =====================================================

/**
 * Send a message to Slack using incoming webhooks
 *
 * Returns result object - Slack notifications should not break main flow.
 *
 * @example
 * ```ts
 * const result = await sendSlackMessage({
 *   text: "User signed up",
 *   blocks: [{
 *     type: "section",
 *     text: { type: "mrkdwn", text: "🎉 *New User Signed Up*" }
 *   }]
 * });
 *
 * if (!result.success) {
 *   console.warn("Slack notification failed, continuing...");
 * }
 * ```
 */
export async function sendSlackMessage(
  params: SlackMessage,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    console.log("🔵 [Slack] Sending message");

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        blocks: params.blocks,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [Slack] Send failed:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    console.log("✅ [Slack] Message sent successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ [Slack] Error sending message:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Send a simple text notification to Slack
 *
 * Convenience wrapper for simple messages with environment context.
 *
 * @example
 * ```ts
 * await sendSimpleNotification({
 *   text: "🎉 User john@example.com just signed up!"
 * });
 * ```
 */
export async function sendSimpleNotification(params: {
  text: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  return sendSlackMessage({
    text: params.text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: params.text,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${ENV_LABEL} | ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  });
}

/**
 * Send a formatted event notification to Slack
 *
 * Structured notification with emoji, title, fields, and context.
 *
 * @example
 * ```ts
 * await sendEventNotification({
 *   emoji: "🎉",
 *   title: "New User Signed Up",
 *   fields: {
 *     "Email": "user@example.com",
 *     "Name": "John Doe"
 *   },
 *   context: "user_signed_up"
 * });
 * ```
 */
export async function sendEventNotification(params: {
  emoji: string;
  title: string;
  fields: Record<string, string | number | boolean | undefined>;
  context?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { emoji, title, fields, context } = params;

  const fieldBlocks = Object.entries(fields)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => ({
      type: "mrkdwn" as const,
      text: `*${formatFieldName(key)}:*\n${String(value)}`,
    }));

  const contextText = context
    ? `${ENV_LABEL} | \`${context}\` | ${new Date().toISOString()}`
    : `${ENV_LABEL} | ${new Date().toISOString()}`;

  return sendSlackMessage({
    text: `${emoji} ${title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${title}*`,
        },
      },
      {
        type: "section",
        fields: fieldBlocks,
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: contextText,
          },
        ],
      },
    ],
  });
}

/**
 * Send an error notification to Slack
 *
 * Formatted error alert with stack trace and context.
 *
 * @example
 * ```ts
 * await sendErrorNotification({
 *   title: "Payment Processing Failed",
 *   error: error.message,
 *   context: { userId: "123", orderId: "456" }
 * });
 * ```
 */
export async function sendErrorNotification(params: {
  title: string;
  error: string;
  context?: Record<string, string | number>;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { title, error, context } = params;

  const contextText = context
    ? Object.entries(context)
        .map(([key, value]) => `${key}: \`${value}\``)
        .join(" | ")
    : undefined;

  return sendSlackMessage({
    text: `⚠️ ${title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *${title}*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error:*\n\`\`\`${error}\`\`\``,
        },
      },
      ...(contextText
        ? [
            {
              type: "context" as const,
              elements: [
                {
                  type: "mrkdwn" as const,
                  text: `${ENV_LABEL} | ${contextText} | ${new Date().toISOString()}`,
                },
              ],
            },
          ]
        : [
            {
              type: "context" as const,
              elements: [
                {
                  type: "mrkdwn" as const,
                  text: `${ENV_LABEL} | ${new Date().toISOString()}`,
                },
              ],
            },
          ]),
    ],
  });
}

// =====================================================
// BOT-TOKEN POSTING (chat.postMessage by channel ID)
// =====================================================
//
// Mirrors wander.com's `postOnSlack` (src/features/postOnSlack): posts to a
// specific channel ID using the shared wandercom Slack app bot token. Use this —
// not the incoming-webhook helpers above — whenever you need to target a channel
// by ID, e.g. the #radio-* lead/listening channels (incoming webhooks are bound
// to one channel at creation and can't take a channel ID). The bot must be
// invited to the target channel. Outside production every post is redirected to
// #radio-slack-testing so dev/preview never pings a live channel — the same
// guard wander.com uses.

interface PostOnSlackMessage {
  text: string;
  channel: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
}

/**
 * Post to a Slack channel by ID via chat.postMessage. Best-effort: returns a
 * result object instead of throwing, so a Slack hiccup never breaks the caller's
 * main flow (mention ingestion, lead routing, …).
 */
export async function postOnSlack(
  message: PostOnSlackMessage,
): Promise<
  { success: true; ts?: string } | { success: false; error: string }
> {
  if (!env.SLACK_API_TOKEN) {
    console.warn("⚠️ [Slack] SLACK_API_TOKEN not set — skipping post");
    return { success: false, error: "SLACK_API_TOKEN not set" };
  }

  const channel = envSelect({
    prod: message.channel,
    test: "radio-slack-testing",
  });

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${env.SLACK_API_TOKEN}`,
      },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks,
        thread_ts: message.thread_ts,
        channel,
      }),
    });

    // Slack returns HTTP 200 with { ok: false, error } on logical failures
    // (bad channel, not_in_channel, invalid_auth), so check both. `ts` is the
    // posted message's id — callers thread follow-ups off it (thread_ts).
    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      ts?: string;
    };
    if (!response.ok || !data.ok) {
      console.error("❌ [Slack] chat.postMessage failed:", data);
      return { success: false, error: data.error ?? `HTTP ${response.status}` };
    }
    return { success: true, ts: data.ts };
  } catch (error) {
    console.error("❌ [Slack] Error posting message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =====================================================
// INTERNAL UTILITIES
// =====================================================

/**
 * INTERNAL: Format field names for display
 * Converts camelCase/snake_case to Title Case
 */
function formatFieldName(key: string): string {
  // Convert camelCase/snake_case to Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
