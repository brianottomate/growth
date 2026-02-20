import { envSelect } from "@/env";

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
