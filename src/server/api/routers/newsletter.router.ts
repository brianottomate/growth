import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import {
  protectedProcedure,
  publicProcedure,
  actionProcedure,
} from "@/server/api/orpc";
import { memberTable } from "@/server/db/schema";
import type { db } from "@/server/db";
import {
  createContact,
  subscribeToTopics,
  getContactTopicSubscriptions,
} from "@/server/clients/resend.client";
import { topicKeySchema, emailSchema } from "@/lib/validators";
import { emailDocumentDraftSchema } from "@/lib/email-document";
import { listingsDigestSchema } from "@/lib/listings-digest";
import { MESSAGE_AUDIENCE_KINDS } from "@/lib/email-delivery";
import {
  exportEmailHandoff,
  renderEmailPreview,
  restoreEmailDocumentVersion,
} from "@/server/services/email-document.service";
import {
  approveMessageSend,
  createMessageSendDraft,
  sendApprovedMessage,
} from "@/server/services/email-delivery.service";
import {
  digestHomePhotos,
  matchDigestHomes,
  setDigestHomeHero,
} from "@/server/services/newsletter-homes.service";
import {
  generateEmailDraft as generateEmailDraftAction,
  getEmailDraft as getEmailDraftAction,
  updateEmailDraft as updateEmailDraftAction,
} from "@/server/ai/capabilities/email";

const ANONYMOUS_EMAIL_DOMAIN = "@anonymous.example.com"; // Update to match your Better Auth anonymous domain

async function organizationMembershipForUser(
  database: typeof db,
  userId: string,
) {
  const membership = await database.query.memberTable.findFirst({
    where: eq(memberTable.userId, userId),
    columns: { organizationId: true, role: true },
  });
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No organization" });
  }
  return membership;
}

async function organizationIdForUser(database: typeof db, userId: string) {
  return (await organizationMembershipForUser(database, userId)).organizationId;
}

async function deliveryOrganizationIdForUser(
  database: typeof db,
  userId: string,
) {
  const membership = await organizationMembershipForUser(database, userId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ORPCError("FORBIDDEN", {
      message: "Only organization owners and admins can approve or send email.",
    });
  }
  return membership.organizationId;
}

export const newsletterRouter = {
  workspace: actionProcedure(getEmailDraftAction),

  generateDraft: actionProcedure(generateEmailDraftAction),

  saveDocument: actionProcedure(updateEmailDraftAction),

  restoreVersion: protectedProcedure
    .input(z.object({ platformPostId: z.string(), versionId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return restoreEmailDocumentVersion({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  renderPreview: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        draft: emailDocumentDraftSchema.optional(),
        // template = raw liquid as CIO receives it; full/sparse simulate the
        // per-recipient expansion locally (seed sends stay the real check).
        viewAs: z.enum(["template", "full", "sparse"]).optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return renderEmailPreview({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  exportHandoff: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return {
        markdown: await exportEmailHandoff({
          ...input,
          organizationId,
          userId: ctx.session.user.id,
        }),
      };
    }),

  /**
   * Match a digest's homes to wander.com: tier, cheapest stay, savings and the
   * email photo with its pill. Returns the digest for the draft; the issue is
   * saved the way every other edit is.
   */
  matchDigestHomes: protectedProcedure
    .input(
      z.object({
        digest: listingsDigestSchema,
        only: z
          .object({
            section: z.number().int().nonnegative(),
            property: z.number().int().nonnegative(),
          })
          .optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const orgId = await organizationIdForUser(ctx.db, ctx.session.user.id);
      return matchDigestHomes({
        ...input,
        orgId,
        userId: ctx.session.user.id,
      });
    }),

  /** A matched home's photos, exteriors first, to choose its hero from. */
  digestHomePhotos: protectedProcedure
    .input(z.object({ homeId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      const orgId = await organizationIdForUser(ctx.db, ctx.session.user.id);
      return digestHomePhotos({ ...input, orgId });
    }),

  /** Make one of a home's photos its hero and render it for the email. */
  setDigestHomeHero: protectedProcedure
    .input(z.object({ homeId: z.string().min(1), heroUrl: z.string().url() }))
    .handler(async ({ context: ctx, input }) => {
      const orgId = await organizationIdForUser(ctx.db, ctx.session.user.id);
      return setDigestHomeHero({
        ...input,
        orgId,
        userId: ctx.session.user.id,
      });
    }),

  prepareSend: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        providerBroadcastId: z.number().int().positive(),
        audienceKind: z.enum(MESSAGE_AUDIENCE_KINDS),
        segmentId: z.number().int().positive(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return createMessageSendDraft({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  approveSend: protectedProcedure
    .input(z.object({ messageSendId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await deliveryOrganizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return approveMessageSend({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  sendApproved: protectedProcedure
    .input(
      z.object({
        messageSendId: z.string(),
        confirmation: z.literal("SEND"),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const organizationId = await deliveryOrganizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return sendApprovedMessage({
        messageSendId: input.messageSendId,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  subscribe: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        path: z.string().optional(),
        topic: topicKeySchema.optional(), // Single topic
      }),
    )
    .handler(async ({ input }) => {
      const { email, path, topic } = input;

      // Skip anonymous emails
      if (email.includes(ANONYMOUS_EMAIL_DOMAIN)) {
        return {
          success: false,
          message: "Cannot subscribe anonymous email",
        };
      }

      try {
        // Create contact in Resend (idempotent)
        const contactResult = await createContact({ email });

        if (!contactResult.success) {
          throw new Error(contactResult.error || "Failed to create contact");
        }

        // Subscribe to topic if specified
        if (topic) {
          const topicResult = await subscribeToTopics({
            email,
            topics: [topic],
          });

          if (!topicResult.success) {
            console.warn(
              `Failed to subscribe to topic ${topic}:`,
              topicResult.error,
            );
            // Don't fail the whole operation if topic subscription fails
          }
        }

        // Log for analytics
        console.log("Newsletter subscription:", {
          email,
          path,
          topic,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          message: "Successfully subscribed!",
        };
      } catch (error) {
        console.error("Newsletter subscription error:", error);
        return {
          success: false,
          message:
            error instanceof Error ? error.message : "Subscription failed",
        };
      }
    }),

  /**
   * Get newsletter topic subscriptions
   * For authenticated users: uses session email
   * For anonymous users: requires email parameter (from localStorage)
   */
  getMyTopics: publicProcedure
    .input(
      z
        .object({
          email: z.string().email().optional(), // Optional email for anonymous users
        })
        .optional(),
    )
    .handler(async ({ context: ctx, input }) => {
      // Determine which email to use:
      // 1. If provided in input, use that (for anonymous users with localStorage email)
      // 2. Otherwise, use session email (for authenticated users)
      const email = input?.email || ctx.session?.user?.email;

      if (!email) {
        return {
          isSubscribed: false,
          topics: [],
        };
      }

      // Skip anonymous email domains
      if (email.includes(ANONYMOUS_EMAIL_DOMAIN)) {
        return {
          isSubscribed: false,
          topics: [],
        };
      }

      try {
        const result = await getContactTopicSubscriptions({ email });

        if (!result.success) {
          return {
            isSubscribed: false,
            topics: [],
          };
        }

        return {
          isSubscribed: true,
          email,
          topics: result.topics || [],
        };
      } catch (error) {
        console.error("Failed to get user topics:", error);
        return {
          isSubscribed: false,
          topics: [],
        };
      }
    }),

  /**
   * Update topic subscriptions
   * For authenticated users: uses session email
   * For anonymous users: requires email parameter (from localStorage)
   */
  updateMyTopics: publicProcedure
    .input(
      z.object({
        topics: z.array(topicKeySchema),
        email: z.string().email().optional(), // Optional email for anonymous users
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      // Determine which email to use:
      // 1. If provided in input, use that (for anonymous users with localStorage email)
      // 2. Otherwise, use session email (for authenticated users)
      const email = input.email || ctx.session?.user?.email;

      if (!email) {
        throw new Error("No email found for user");
      }

      // Skip anonymous email domains
      if (email.includes(ANONYMOUS_EMAIL_DOMAIN)) {
        throw new Error("Cannot update topics for anonymous email");
      }

      try {
        const result = await subscribeToTopics({
          email,
          topics: input.topics,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to update topics");
        }

        return {
          success: true,
          message: "Topics updated successfully",
        };
      } catch (error) {
        console.error("Failed to update user topics:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to update topics",
        );
      }
    }),
};
