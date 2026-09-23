import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  organizationAccess,
  organizationInput,
} from "@/server/api/orpc";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { R2 } from "@/server/clients/r2.client";
import {
  generateTempPassword,
  resetUserCredentialPassword,
} from "@/server/services/account.service";

const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024; // server upload limit

type PhotoInput = {
  photo?: { base64Data: string; mimeType: string; filename: string };
  photoUrl?: string;
};

/**
 * Upload a profile photo to R2 (same store as the media library). Source is
 * either an uploaded/pasted file (base64) or a URL we fetch + rehost
 * server-side (sidesteps CORS + hotlink expiry). Returns the public URL, or
 * null when no source was supplied.
 */
async function uploadUserPhoto(
  userId: string,
  src: PhotoInput,
): Promise<string | null> {
  if (src.photo) {
    const buffer = Buffer.from(src.photo.base64Data, "base64");
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new ORPCError("BAD_REQUEST", { message: "Photo exceeds 4.5MB" });
    }
    const key = R2.buildUserPhotoKey(userId, src.photo.filename);
    return R2.putBuffer(key, buffer, src.photo.mimeType);
  }
  if (src.photoUrl) {
    const ext = src.photoUrl.split(".").pop()?.slice(0, 5) ?? "jpg";
    const key = R2.buildUserPhotoKey(userId, `avatar.${ext}`);
    return R2.putFromUrl(key, src.photoUrl);
  }
  return null;
}

export const orgRouter = {
  // Get invitation details (public - used by invite page)
  getOrgInvite: publicProcedure
    .input(z.object({ invitationId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
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
        throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
      }

      // Check if expired
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw new ORPCError("BAD_REQUEST", { message: "Invitation expired" });
      }

      // Check if already accepted
      if (invitation.status !== "pending") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invitation no longer valid",
        });
      }

      return invitation;
    }),

  // Accept invitation (protected)
  acceptInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      // Delegate to Better Auth
      const result = await ctx.authApi.acceptInvitation({
        body: { invitationId: input.invitationId },
        headers: ctx.headers,
      });

      return result;
    }),

  // List user's organizations
  list: protectedProcedure.handler(async ({ context: ctx }) => {
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
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
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
        throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
      }

      // Check if user is a member
      const isMember = org.members.some(
        (member) => member.userId === ctx.session.user.id,
      );

      if (!isMember) {
        throw new ORPCError("FORBIDDEN", {
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

  // Update organization (admins+)
  update: protectedProcedure
    .input(
      organizationInput.extend({
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(100).optional(),
        logo: z.string().nullable().optional(),
      }),
    )
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canUpdateOrg) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can update organization settings",
        });
      }

      if (input.slug) {
        const existing = await ctx.db.query.organizationTable.findFirst({
          where: eq(schema.organizationTable.slug, input.slug),
        });
        if (existing && existing.id !== ctx.organization.id) {
          throw new ORPCError("CONFLICT", {
            message: "This slug is already taken",
          });
        }
      }

      const [updated] = await ctx.db
        .update(schema.organizationTable)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.slug && { slug: input.slug }),
          ...(input.logo !== undefined && { logo: input.logo }),
        })
        .where(eq(schema.organizationTable.id, ctx.organization.id))
        .returning();

      return updated;
    }),

  // Delete organization (owner only)
  delete: organizationProcedure.handler(async ({ context: ctx }) => {
    if (!ctx.orgPermissions.canDeleteOrg) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only the owner can delete the organization",
      });
    }

    await ctx.db
      .delete(schema.organizationTable)
      .where(eq(schema.organizationTable.id, ctx.organization.id));

    return { success: true };
  }),

  // Invite member (admins+)
  inviteMember: protectedProcedure
    .input(
      organizationInput.extend({
        email: z.string().email(),
        role: z.enum(["admin", "member"]),
      }),
    )
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canInvite) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can invite members",
        });
      }

      return ctx.authApi.createInvitation({
        body: {
          email: input.email.trim().toLowerCase(),
          role: input.role,
          organizationId: ctx.organization.id,
        },
        headers: ctx.headers,
      });
    }),

  // Pre-create a teammate's account (admins+, no email sent).
  createPerson: protectedProcedure
    .input(
      organizationInput.extend({
        name: z.string().min(1).max(120),
        email: z.string().email(),
        role: z.enum(["admin", "member"]).default("member"),
        photo: z
          .object({
            base64Data: z.string(),
            mimeType: z.string(),
            filename: z.string(),
          })
          .optional(),
        photoUrl: z.string().url().optional(),
      }),
    )
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canManageMembers) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can create members",
        });
      }

      const email = input.email.trim().toLowerCase();
      const tempPassword = generateTempPassword();

      let userId: string;
      try {
        const result = await ctx.authApi.createUser({
          body: {
            email,
            name: input.name.trim(),
            password: tempPassword,
            data: {},
          },
        });
        userId = result.user.id;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create user";
        throw new ORPCError(
          message.toLowerCase().includes("already")
            ? "CONFLICT"
            : "BAD_REQUEST",
          { message },
        );
      }

      const existing = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(schema.memberTable.userId, userId),
          eq(schema.memberTable.organizationId, ctx.organization.id),
        ),
      });
      if (existing) {
        if (existing.role !== input.role) {
          await ctx.db
            .update(schema.memberTable)
            .set({ role: input.role })
            .where(eq(schema.memberTable.id, existing.id));
        }
      } else {
        await ctx.db.insert(schema.memberTable).values({
          id: createId("mbr"),
          userId,
          organizationId: ctx.organization.id,
          role: input.role,
        });
      }

      const photoRequested = Boolean(input.photo || input.photoUrl);
      let photoSet = false;
      try {
        const url = await uploadUserPhoto(userId, input);
        if (url) {
          await ctx.db
            .update(schema.userTable)
            .set({ image: url })
            .where(eq(schema.userTable.id, userId));
          photoSet = true;
        }
      } catch (error) {
        console.error("[createPerson] photo upload failed:", error);
      }

      return { userId, email, tempPassword, photoRequested, photoSet };
    }),

  // Only genuinely pending, unexpired invitations (admins+).
  listInvitations: organizationProcedure.handler(async ({ context: ctx }) => {
    if (!ctx.orgPermissions.canInvite) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only admins can view invitations",
      });
    }

    return ctx.db.query.invitationTable.findMany({
      where: and(
        eq(schema.invitationTable.organizationId, ctx.organization.id),
        eq(schema.invitationTable.status, "pending"),
        or(
          isNull(schema.invitationTable.expiresAt),
          gt(schema.invitationTable.expiresAt, new Date()),
        ),
      ),
      with: {
        inviter: {
          columns: { id: true, name: true, email: true, image: true },
        },
      },
    });
  }),

  cancelInvitation: protectedProcedure
    .input(organizationInput.extend({ invitationId: z.string() }))
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canInvite) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can cancel invitations",
        });
      }

      const invitation = await ctx.db.query.invitationTable.findFirst({
        where: and(
          eq(schema.invitationTable.id, input.invitationId),
          eq(schema.invitationTable.organizationId, ctx.organization.id),
        ),
        columns: { id: true },
      });
      if (!invitation) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invitation not found in this organization",
        });
      }

      await ctx.db
        .update(schema.invitationTable)
        .set({ status: "expired" })
        .where(eq(schema.invitationTable.id, invitation.id));

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(organizationInput.extend({ memberId: z.string() }))
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canManageMembers) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can remove members",
        });
      }

      const member = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(schema.memberTable.id, input.memberId),
          eq(schema.memberTable.organizationId, ctx.organization.id),
        ),
      });
      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found in this organization",
        });
      }
      if (member.userId === ctx.session.user.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You can't remove yourself",
        });
      }
      if (member.role === "owner") {
        if (ctx.membership.role !== "owner") {
          throw new ORPCError("FORBIDDEN", {
            message: "Only an owner can remove another owner",
          });
        }
        const owners = await ctx.db.query.memberTable.findMany({
          where: and(
            eq(schema.memberTable.organizationId, ctx.organization.id),
            eq(schema.memberTable.role, "owner"),
          ),
          columns: { id: true },
        });
        if (owners.length <= 1) {
          throw new ORPCError("BAD_REQUEST", {
            message: "An organization must keep at least one owner",
          });
        }
      }

      await ctx.db
        .delete(schema.memberTable)
        .where(eq(schema.memberTable.id, member.id));

      return { success: true };
    }),

  resetPassword: protectedProcedure
    .input(organizationInput.extend({ memberId: z.string() }))
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      if (!ctx.orgPermissions.canManageMembers) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can reset member passwords",
        });
      }

      const member = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(schema.memberTable.id, input.memberId),
          eq(schema.memberTable.organizationId, ctx.organization.id),
        ),
        columns: { userId: true },
      });
      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found in this organization",
        });
      }

      const tempPassword = await resetUserCredentialPassword(member.userId);
      return { tempPassword };
    }),

  // Members may edit themselves; admins may edit other members.
  updatePerson: protectedProcedure
    .input(
      organizationInput.extend({
        memberId: z.string(),
        name: z.string().min(1).max(120).optional(),
        role: z.enum(["owner", "admin", "member"]).optional(),
        photo: z
          .object({
            base64Data: z.string(),
            mimeType: z.string(),
            filename: z.string(),
          })
          .optional(),
        photoUrl: z.string().url().optional(),
      }),
    )
    .use(organizationAccess)
    .handler(async ({ context: ctx, input }) => {
      const member = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(schema.memberTable.id, input.memberId),
          eq(schema.memberTable.organizationId, ctx.organization.id),
        ),
      });
      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found in this organization",
        });
      }

      const isSelf = member.userId === ctx.session.user.id;
      if (!isSelf && !ctx.orgPermissions.canManageMembers) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins can edit another member",
        });
      }

      if (input.role && input.role !== member.role) {
        if (isSelf) {
          throw new ORPCError("BAD_REQUEST", {
            message: "You can't change your own role",
          });
        }
        if (!ctx.orgPermissions.canManageMembers) {
          throw new ORPCError("FORBIDDEN", {
            message: "Only admins can change member roles",
          });
        }
        const ownerInvolved = input.role === "owner" || member.role === "owner";
        if (ownerInvolved && ctx.membership.role !== "owner") {
          throw new ORPCError("FORBIDDEN", {
            message: "Only an owner can assign or change the owner role",
          });
        }
        if (member.role === "owner" && input.role !== "owner") {
          const owners = await ctx.db.query.memberTable.findMany({
            where: and(
              eq(schema.memberTable.organizationId, ctx.organization.id),
              eq(schema.memberTable.role, "owner"),
            ),
            columns: { id: true },
          });
          if (owners.length <= 1) {
            throw new ORPCError("BAD_REQUEST", {
              message: "An organization must keep at least one owner",
            });
          }
        }
      }

      const url = await uploadUserPhoto(member.userId, input);
      if (url) {
        await ctx.db
          .update(schema.userTable)
          .set({ image: url })
          .where(eq(schema.userTable.id, member.userId));
      }

      if (input.name) {
        await ctx.db
          .update(schema.userTable)
          .set({ name: input.name.trim() })
          .where(eq(schema.userTable.id, member.userId));
      }

      if (input.role && input.role !== member.role) {
        await ctx.db
          .update(schema.memberTable)
          .set({ role: input.role })
          .where(eq(schema.memberTable.id, member.id));
      }

      return { success: true };
    }),
};
