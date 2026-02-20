import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import * as schema from "@/server/db/schema";

export const orgRouter = createTRPCRouter({
  // Get invitation details (public - used by invite page)
  getOrgInvite: publicProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.query.invitationTable.findFirst({
        where: eq(schema.invitationTable.id, input.invitationId),
        with: {
          organization: true,
          inviter: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Check if expired
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation expired",
        });
      }

      // Check if already accepted
      if (invitation.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation no longer valid",
        });
      }

      return invitation;
    }),

  // Accept invitation (protected)
  acceptInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delegate to Better Auth
      const result = await ctx.authApi.acceptInvitation({
        body: { invitationId: input.invitationId },
        headers: ctx.headers,
      });

      return result;
    }),

  // List user's organizations
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgs = await ctx.authApi.listOrganizations({
      headers: ctx.headers,
    });
    return orgs;
  }),

  // Create organization
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.authApi.createOrganization({
        body: {
          name: input.name,
          slug: input.slug,
        },
        headers: ctx.headers,
      });
      return org;
    }),

  // Get organization by slug
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.query.organizationTable.findFirst({
        where: eq(schema.organizationTable.slug, input.slug),
        with: {
          members: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Check if user is a member
      const isMember = org.members.some(
        (member) => member.userId === ctx.session.user.id,
      );

      if (!isMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      // Get user's role
      const userMembership = org.members.find(
        (member) => member.userId === ctx.session.user.id,
      );

      return {
        organization: org,
        members: org.members,
        userRole: userMembership?.role || "member",
      };
    }),

  // Update organization
  update: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(100).optional(),
        logo: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is an admin of the organization
      const membership = await ctx.db.query.memberTable.findFirst({
        where: eq(schema.memberTable.userId, ctx.session.user.id),
      });

      if (!membership || membership.role === "member") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update organization settings",
        });
      }

      // If slug is being updated, check if it's available
      if (input.slug) {
        const existing = await ctx.db.query.organizationTable.findFirst({
          where: eq(schema.organizationTable.slug, input.slug),
        });

        if (existing && existing.id !== input.organizationId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This slug is already taken",
          });
        }
      }

      const updated = await ctx.db
        .update(schema.organizationTable)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.slug && { slug: input.slug }),
          ...(input.logo !== undefined && { logo: input.logo }),
        })
        .where(eq(schema.organizationTable.id, input.organizationId))
        .returning();

      return updated[0];
    }),

  // Delete organization
  delete: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is the owner
      const membership = await ctx.db.query.memberTable.findFirst({
        where: eq(schema.memberTable.userId, ctx.session.user.id),
      });

      if (membership?.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can delete the organization",
        });
      }

      await ctx.db
        .delete(schema.organizationTable)
        .where(eq(schema.organizationTable.id, input.organizationId));

      return { success: true };
    }),

  // Invite member
  inviteMember: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]),
        organizationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.authApi.createInvitation({
        body: {
          email: input.email,
          role: input.role,
          organizationId: input.organizationId,
        },
        headers: ctx.headers,
      });
      return invitation;
    }),

  // List pending invitations
  listInvitations: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitations = await ctx.db.query.invitationTable.findMany({
        where: eq(schema.invitationTable.organizationId, input.organizationId),
        with: {
          inviter: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      return invitations;
    }),

  // Cancel invitation
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.invitationTable)
        .set({ status: "expired" }) // canceled is not a valid status so using expired instead
        .where(eq(schema.invitationTable.id, input.invitationId));

      return { success: true };
    }),

  // Remove member
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.memberTable)
        .where(eq(schema.memberTable.id, input.memberId));

      return { success: true };
    }),
});
