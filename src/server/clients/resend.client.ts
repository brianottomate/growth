import { Resend } from "resend";
import { render } from "@react-email/components";
import { env } from "@/env";

// =====================================================
// TOPIC CONSTANTS
// =====================================================

/**
 * Newsletter topic constants
 *
 * Defines the available newsletter topics in Resend.
 * These keys provide type-safe access to Resend topics throughout the codebase.
 */
export const NEWSLETTER_TOPICS = [
  "newsletter-general",
  "newsletter-tips",
  "newsletter-product-updates",
] as const;

/**
 * Type-safe topic keys for newsletter subscriptions
 *
 * Use these keys throughout the codebase instead of raw UUIDs.
 * The mapping to Resend topic IDs is handled below.
 */
export type TopicKey = (typeof NEWSLETTER_TOPICS)[number];

// =====================================================
// TOPIC MAPPING
// =====================================================

/**
 * Internal mapping of topic keys to Resend topic IDs
 *
 * IMPORTANT: These IDs are tied to your Resend account.
 * If you recreate topics, update these IDs.
 *
 * TODO: Update these with your actual Resend topic IDs
 */
const TOPIC_ID_MAP: Record<TopicKey, string> = {
  "newsletter-general": "YOUR_GENERAL_TOPIC_ID",
  "newsletter-tips": "YOUR_TIPS_TOPIC_ID",
  "newsletter-product-updates": "YOUR_PRODUCT_UPDATES_TOPIC_ID",
} as const;

/**
 * Reverse mapping: Resend topic ID -> Topic key
 */
const TOPIC_KEY_MAP: Record<string, TopicKey> = Object.fromEntries(
  Object.entries(TOPIC_ID_MAP).map(([key, id]) => [id, key as TopicKey]),
);

// =====================================================
// TOPIC HELPERS
// =====================================================

/** Convert topic key to Resend ID */
function getTopicId(key: TopicKey): string {
  return TOPIC_ID_MAP[key];
}

/** Convert Resend ID to topic key */
function getTopicKey(id: string): TopicKey | undefined {
  return TOPIC_KEY_MAP[id];
}

/** Convert array of topic keys to IDs */
function getTopicIds(keys: TopicKey[]): string[] {
  return keys.map(getTopicId);
}

/** Convert array of topic IDs to keys */
function getTopicKeys(ids: string[]): TopicKey[] {
  return ids.map(getTopicKey).filter((k): k is TopicKey => k !== undefined);
}

// =====================================================
// EMAIL TEMPLATES
// =====================================================

export type EmailTemplateName =
  | "organization_invitation"
  | "email_verification"
  | "password_reset";

interface OrganizationInvitationVariables {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  role?: string;
}

interface EmailVerificationVariables {
  verificationUrl: string;
}

interface PasswordResetVariables {
  resetUrl: string;
}

type EmailVariables = {
  organization_invitation: OrganizationInvitationVariables;
  email_verification: EmailVerificationVariables;
  password_reset: PasswordResetVariables;
};

const emailSubjects = {
  organization_invitation: "You've been invited to join an organization",
  email_verification: "Verify your email address",
  password_reset: "Reset your password",
} as const satisfies Record<EmailTemplateName, string>;

/**
 * Render email template to HTML string
 */
async function renderEmailTemplate<T extends EmailTemplateName>(
  templateName: T,
  variables: EmailVariables[T],
): Promise<string> {
  switch (templateName) {
    case "organization_invitation": {
      const { default: OrganizationInvitationInline } =
        await import("../../../emails/OrganizationInvitationInline");
      return render(
        OrganizationInvitationInline(
          variables as OrganizationInvitationVariables,
        ),
      );
    }
    case "email_verification": {
      const { default: EmailVerificationInline } =
        await import("../../../emails/EmailVerificationInline");
      return render(
        EmailVerificationInline(variables as EmailVerificationVariables),
      );
    }
    case "password_reset": {
      // Re-use email verification template for password reset for now
      // TODO: Create a dedicated password reset template
      const { default: EmailVerificationInline } =
        await import("../../../emails/EmailVerificationInline");
      return render(
        EmailVerificationInline({
          verificationUrl: (variables as PasswordResetVariables).resetUrl,
        }),
      );
    }
    default:
      throw new Error(`Unknown template: ${templateName}`);
  }
}

// =====================================================
// CLIENT
// =====================================================

/**
 * Resend client instance
 * Initialized directly on module load for consistency with other service clients
 */
export const resend = new Resend(env.RESEND_API_KEY);

// =====================================================
// TRANSACTIONAL EMAILS
// =====================================================

/**
 * Send transactional email via Resend
 */
export async function sendTransactionalEmail<T extends EmailTemplateName>(
  email: string,
  templateName: T,
  variables: EmailVariables[T],
  options?: {
    from?: string;
    replyTo?: string;
  },
): Promise<{ id: string } | null> {
  const subject = emailSubjects[templateName];
  const html = await renderEmailTemplate(templateName, variables);

  const DEFAULT_FROM = "Your App <hello@email.wander.com>";
  const DEFAULT_REPLY_TO = "support@email.wander.com";

  try {
    const response = await resend.emails.send({
      from: options?.from ?? DEFAULT_FROM,
      to: email,
      subject,
      html,
      replyTo: options?.replyTo ?? DEFAULT_REPLY_TO,
    });

    if (response.error) {
      console.error("[Resend] Failed to send email:", response.error);
      return null;
    }

    console.log(
      `[Resend] Sent ${templateName} to ${email} (ID: ${response.data?.id})`,
    );
    return { id: response.data.id };
  } catch (error) {
    console.error("[Resend] Error sending email:", error);
    return null;
  }
}

// =====================================================
// CONTACTS & TOPICS
// =====================================================

/**
 * Create or update a contact in Resend
 * Idempotent - safe to call multiple times with same email
 */
export async function createContact(params: {
  email: string;
  unsubscribed?: boolean;
}) {
  try {
    const response = await resend.contacts.create({
      email: params.email,
      unsubscribed: params.unsubscribed ?? false,
    });

    return { success: true, data: response };
  } catch (error) {
    // Resend returns 400 if contact already exists - handle gracefully
    if (error instanceof Error && error.message.includes("already exists")) {
      console.log(`Contact ${params.email} already exists`);
      return { success: true, alreadyExists: true };
    }

    console.error("Failed to create contact:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * INTERNAL: Fetch all topics for a contact
 */
async function getContactTopics(params: { email: string }) {
  try {
    const { data, error } = await resend.contacts.topics.list({
      email: params.email,
    });

    if (error) {
      console.error("❌ Failed to get contact topics:", error);
      return { success: false as const, error: error.message };
    }

    console.log(
      `📋 Retrieved ${data?.data?.length || 0} topics for ${params.email}`,
    );
    return { success: true as const, data };
  } catch (error) {
    console.error("❌ Failed to get contact topics:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * INTERNAL: Update all topics for a contact (replaces everything)
 * This is a low-level function - prefer using subscribeToTopics or unsubscribeFromTopics
 */
async function updateContactTopics(params: {
  email: string;
  topics: Array<{ id: string; subscription: "opt_in" | "opt_out" }>;
}) {
  try {
    console.log(
      `📝 Updating ${params.topics.length} topic(s) for ${params.email}:`,
      params.topics
        .map((t) => `${t.id.slice(0, 8)}...:${t.subscription}`)
        .join(", "),
    );

    const response = await resend.contacts.topics.update({
      email: params.email,
      topics: params.topics,
    });

    console.log(`✅ Updated topics for ${params.email}`);
    return { success: true as const, data: response };
  } catch (error) {
    console.error("❌ Failed to update topics:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Subscribe a contact to specific topics (preserves other subscriptions)
 *
 * This is the main public API for subscribing users to topics.
 * It automatically:
 * 1. Creates the contact if needed
 * 2. Fetches current topic subscriptions
 * 3. Merges with new subscriptions
 * 4. Updates Resend with the complete list
 *
 * @example
 * await subscribeToTopics({
 *   email: "user@example.com",
 *   topics: ["newsletter-general"]
 * });
 */
export async function subscribeToTopics(params: {
  email: string;
  topics: TopicKey[];
}) {
  try {
    // Ensure contact exists
    const contactResult = await createContact({ email: params.email });

    // If contact was just created, wait for Resend to populate default topics
    if (!contactResult.alreadyExists) {
      console.log(
        "⏳ New contact, waiting 500ms for Resend to populate topics...",
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Get current topics to preserve other subscriptions
    const currentTopicsResult = await getContactTopics({ email: params.email });

    // Build map of all topics
    const topicsMap = new Map<string, "opt_in" | "opt_out">();

    // Start with current subscriptions
    if (currentTopicsResult.success && currentTopicsResult.data?.data) {
      currentTopicsResult.data.data.forEach((topic) => {
        topicsMap.set(topic.id, topic.subscription);
      });
    }

    // Add new subscriptions (opt_in) - convert keys to IDs
    const topicIds = getTopicIds(params.topics);
    topicIds.forEach((topicId) => {
      topicsMap.set(topicId, "opt_in");
    });

    // Convert to array for API
    const topics = Array.from(topicsMap.entries()).map(
      ([id, subscription]) => ({ id, subscription }),
    );

    // Update all topics
    return await updateContactTopics({ email: params.email, topics });
  } catch (error) {
    console.error("❌ Failed to subscribe to topics:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Unsubscribe a contact from specific topics (preserves other subscriptions)
 *
 * @example
 * await unsubscribeFromTopics({
 *   email: "user@example.com",
 *   topics: ["newsletter-general"]
 * });
 */
export async function unsubscribeFromTopics(params: {
  email: string;
  topics: TopicKey[];
}) {
  try {
    // Get current topics
    const currentTopicsResult = await getContactTopics({ email: params.email });

    if (!currentTopicsResult.success) {
      return currentTopicsResult;
    }

    // Build map of all topics
    const topicsMap = new Map<string, "opt_in" | "opt_out">();

    // Start with current subscriptions
    if (currentTopicsResult.data?.data) {
      currentTopicsResult.data.data.forEach((topic) => {
        topicsMap.set(topic.id, topic.subscription);
      });
    }

    // Set specified topics to opt_out - convert keys to IDs
    const topicIds = getTopicIds(params.topics);
    topicIds.forEach((topicId) => {
      topicsMap.set(topicId, "opt_out");
    });

    // Convert to array for API
    const topics = Array.from(topicsMap.entries()).map(
      ([id, subscription]) => ({ id, subscription }),
    );

    // Update all topics
    return await updateContactTopics({ email: params.email, topics });
  } catch (error) {
    console.error("❌ Failed to unsubscribe from topics:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get a contact's topic subscriptions
 *
 * Returns which topics the contact is subscribed to (opt_in) and which they're not (opt_out)
 * Returns topic keys, not UUIDs
 */
export async function getContactTopicSubscriptions(params: {
  email: string;
}): Promise<{
  success: boolean;
  topics?: TopicKey[];
  error?: string;
}> {
  const result = await getContactTopics(params);

  if (!result.success || !result.data?.data) {
    return { success: result.success, error: result.error };
  }

  // Convert IDs to keys and filter for opt_in only
  const subscribedIds = result.data.data
    .filter((topic) => topic.subscription === "opt_in")
    .map((topic) => topic.id);

  const subscribedKeys = getTopicKeys(subscribedIds);

  return { success: true, topics: subscribedKeys };
}
