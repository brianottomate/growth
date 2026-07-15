import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { memberTable } from "@/server/db/schema";
import type { db } from "@/server/db";
import {
  createContact,
  subscribeToTopics,
  getContactTopicSubscriptions,
} from "@/server/clients/resend.client";
import { topicKeySchema, emailSchema } from "@/lib/validators";
import {
  EMAIL_DOCUMENT_FORMATS,
  emailDocumentDraftSchema,
} from "@/lib/email-document";
import { MESSAGE_AUDIENCE_KINDS } from "@/lib/email-delivery";
import {
  createEmailSlot,
  exportEmailHandoff,
  getEmailWorkspace,
  renderEmailPreview,
  restoreEmailDocumentVersion,
  runEmailGenerationJob,
  saveEmailDocument,
  startEmailGeneration,
} from "@/server/services/email-document.service";
import {
  approveMessageSend,
  createMessageSendDraft,
  sendApprovedMessage,
} from "@/server/services/email-delivery.service";

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
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization" });
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
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can approve or send email.",
    });
  }
  return membership.organizationId;
}

export const newsletterRouter = createTRPCRouter({
  workspace: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await organizationMembershipForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return getEmailWorkspace({
        ...input,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
        canDeliver: membership.role === "owner" || membership.role === "admin",
      });
    }),

  createEmailSlot: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        title: z.string().trim().min(1).max(160),
        format: z.enum(EMAIL_DOCUMENT_FORMATS),
        hook: z.string().trim().max(2_000).optional(),
        purpose: z.string().trim().max(5_000).optional(),
        ctaText: z.string().trim().max(1_000).optional(),
        pillar: z.string().trim().max(120).optional(),
        seriesId: z.string().optional(),
        initiativeId: z.string().optional(),
        plannedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return createEmailSlot({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  generateDraft: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        brief: z.string().trim().max(10_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      const job = await startEmailGeneration({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
      if (job.status === "queued") {
        waitUntil(
          runEmailGenerationJob(job.id).catch((error) =>
            console.error("[email-generation] background job failed", error),
          ),
        );
      }
      return job;
    }),

  saveDocument: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        draft: emailDocumentDraftSchema,
        note: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      return saveEmailDocument({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
    }),

  restoreVersion: protectedProcedure
    .input(z.object({ platformPostId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationIdForUser(
        ctx.db,
        ctx.session.user.id,
      );
      const html = await renderEmailPreview({
        ...input,
        organizationId,
        userId: ctx.session.user.id,
      });
      return { html };
    }),

  exportHandoff: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .query(async ({ ctx, input }) => {
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

  prepareSend: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        providerBroadcastId: z.number().int().positive(),
        audienceKind: z.enum(MESSAGE_AUDIENCE_KINDS),
        segmentId: z.number().int().positive(),
        audienceLabel: z.string().trim().min(1).max(160),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
    .mutation(async ({ ctx, input }) => {
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
    .mutation(async ({ ctx, input }) => {
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
    .mutation(async ({ input }) => {
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
    .query(async ({ ctx, input }) => {
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
    .mutation(async ({ ctx, input }) => {
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
});
