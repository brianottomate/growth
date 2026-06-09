import { randomBytes } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { R2 } from "@/server/clients/r2.client";

// Generate a human-friendly temp password to hand out manually.
function generateTempPassword() {
  // 12 url-safe chars + a digit so it satisfies any min-length/complexity rule.
  return `${randomBytes(9).toString("base64url")}7`;
}

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
      throw new TRPCError({ code: "BAD_REQUEST", message: "Photo exceeds 4.5MB" });
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

  // Pre-create a teammate's account (no email sent). Returns a temp password
  // to hand out manually; they sign in and can change it later. The Better Auth
  // user.create hooks enforce the @wander.com gate and auto-join the Wander org.
  createPerson: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
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
        // Alternative to an uploaded file: fetch an existing image by URL
        // (e.g. a Slack avatar). Fetched server-side to sidestep CORS.
        photoUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const tempPassword = generateTempPassword();

      // Create the user via the trusted server path (no headers → Better Auth
      // skips the admin permission check). Fires the user.create before/after
      // hooks: @wander.com gate + auto-join Wander org as "member".
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create user";
        throw new TRPCError({
          code: message.toLowerCase().includes("already")
            ? "CONFLICT"
            : "BAD_REQUEST",
          message,
        });
      }

      // Reconcile org membership + role. The auto-join hook adds a "member" row
      // for the Wander org; here we ensure a row for the target org at the
      // requested role (updating the hook's row if it already exists).
      const existing = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(schema.memberTable.userId, userId),
          eq(schema.memberTable.organizationId, input.organizationId),
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
          organizationId: input.organizationId,
          role: input.role,
        });
      }

      // Optional profile photo → R2, then set user.image. Swallowed on failure
      // so a bad photo doesn't block account creation; the flag lets the client
      // warn. (An explicit edit later surfaces errors — see updatePerson.)
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
      } catch (err) {
        console.error("[createPerson] photo upload failed:", err);
      }

      return { userId, email, tempPassword, photoRequested, photoSet };
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
      // Don't let the caller remove their own membership and lock themselves out.
      const member = await ctx.db.query.memberTable.findFirst({
        where: eq(schema.memberTable.id, input.memberId),
      });
      if (member?.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't remove yourself",
        });
      }

      await ctx.db
        .delete(schema.memberTable)
        .where(eq(schema.memberTable.id, input.memberId));

      return { success: true };
    }),

  // Generate a fresh temp password for a member and hand it back to show once.
  resetPassword: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.memberTable.findFirst({
        where: eq(schema.memberTable.id, input.memberId),
      });
      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const tempPassword = generateTempPassword();
      // Unlike createUser, the admin-plugin setUserPassword endpoint is guarded
      // by a session middleware, so the "trusted server path (no headers)"
      // trick throws FORBIDDEN. Forward the caller's headers — the caller must
      // be a Better Auth admin (user.role === "admin").
      await ctx.authApi.setUserPassword({
        headers: ctx.headers,
        body: { newPassword: tempPassword, userId: member.userId },
      });
      return { tempPassword };
    }),

  // Edit a member: name, role, and/or profile photo (one dialog).
  updatePerson: protectedProcedure
    .input(
      z.object({
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
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.memberTable.findFirst({
        where: eq(schema.memberTable.id, input.memberId),
      });
      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const isSelf = member.userId === ctx.session.user.id;

      // Photo first → if it fails (bad URL etc.) we abort before touching
      // name/role. Errors surface here since this is an explicit edit.
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
        if (isSelf) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can't change your own role",
          });
        }
        await ctx.db
          .update(schema.memberTable)
          .set({ role: input.role })
          .where(eq(schema.memberTable.id, member.id));
      }

      return { success: true };
    }),
});
