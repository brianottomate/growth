import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, username, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { sendTransactionalEmail } from "@/server/clients/resend.client";
import {
  trackServerEvent,
  identifyServerUser,
} from "@/server/services/analytics.service";

// External collaborators allowed past the @wander.com sign-up gate. Keep this
// short and intentional — each entry is a deliberate exception. Lowercase only
// (emails are normalized before the check).
const ALLOWED_EXTERNAL_EMAILS = new Set<string>([
  "hashimwarren@gmail.com", // Hashim Warren
]);

export const auth = betterAuth({
  // Base URL for auth links (verification emails, password reset, etc.)
  // Falls back to VERCEL_URL in preview/production, or localhost in development
  baseURL:
    env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  // Enable experimental joins for 2-3x performance improvement on session lookups
  experimental: {
    joins: true,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    // Explicit schema mapping for Better Auth
    // Note: Table names in DB are snake_case (user, session, account, verification, organization, etc.)
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
      // Organization tables (NEW)
      organization: schema.organizationTable,
      member: schema.memberTable,
      invitation: schema.invitationTable,
      team: schema.teamTable,
      teamMember: schema.teamMemberTable,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // TEMPORARY (internal tool): skip email verification so teammates can sign
    // in immediately. Flip back to `true` (and `sendOnSignUp` below) to restore.
    requireEmailVerification: false,
    async sendResetPassword({
      user,
      url,
    }: {
      user: { email: string };
      url: string;
    }) {
      console.log(`[Auth] Sending password reset email to ${user.email}`);
      await sendTransactionalEmail(user.email, "password_reset", {
        resetUrl: url,
      });
    },
  },
  emailVerification: {
    // TEMPORARY: paired with requireEmailVerification above. Set back to `true`
    // to resume sending verification emails on sign-up.
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({
      user,
      url,
    }: {
      user: { email: string };
      url: string;
    }) {
      console.log(`[Auth] Sending verification email to ${user.email}`);
      await sendTransactionalEmail(user.email, "email_verification", {
        verificationUrl: url,
      });
    },
  },
  user: {
    additionalFields: {
      // User preferences
      dateFormat: {
        type: "string",
        required: false,
        defaultValue: "mm_dd_yyyy",
      },
      unitSystem: {
        type: "string",
        required: false,
        defaultValue: "metric",
      },
      preferredCurrency: {
        type: "string",
        required: false,
        defaultValue: "usd",
      },
      timeZone: {
        type: "string",
        required: false,
        defaultValue: "UTC",
      },
      // Location tracking
      city: {
        type: "string",
        required: false,
      },
      country: {
        type: "string",
        required: false,
      },
      // Onboarding (simple example - customize for your app)
      onboardingCompletedAt: {
        type: "date",
        required: false,
      },
      onboardingSource: {
        type: "string",
        required: false,
      },
    },
  },
  // ─────────────────────────────────────────────────
  // Database Hooks - Lifecycle events
  // ─────────────────────────────────────────────────
  databaseHooks: {
    user: {
      create: {
        // Internal tool: only allow @wander.com sign-ups. Runs for every user
        // creation path (email/password + Google OAuth).
        before: async (user) => {
          const email = user.email?.toLowerCase() ?? "";
          if (!email.endsWith("@wander.com") && !ALLOWED_EXTERNAL_EMAILS.has(email)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Sign-ups are restricted to @wander.com email addresses.",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          try {
            // Track real user signup
            console.log("[Auth] User created:", user.id);
            trackServerEvent(user.id, "user_signed_up", {
              method: "email",
              email: user.email,
            });

            // Identify user for rich analytics profile
            identifyServerUser(user.id, {
              email: user.email,
              name: user.name ?? undefined,
            });

            // Auto-join the Wander org so internal teammates land scoped.
            const wanderOrg = await db.query.organizationTable.findFirst({
              where: eq(schema.organizationTable.slug, "wander"),
            });
            if (wanderOrg) {
              await db.insert(schema.memberTable).values({
                id: createId("mbr"),
                userId: user.id,
                organizationId: wanderOrg.id,
                role: "member",
              });
              console.log(
                `[Auth] Added ${user.email} to Wander org as member`,
              );
            } else {
              console.warn("[Auth] Wander org not found; skipped auto-join");
            }
          } catch (error) {
            console.error("[Auth] Error in user.create.after hook:", error);
            // Don't block user creation if tracking fails
          }
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          try {
            console.log("[Auth] Account created:", account.userId);

            // Track with correct discriminated union shape
            if (account.password) {
              trackServerEvent(account.userId, "user_account_created", {
                method: "email",
              });
            } else if (
              account.providerId === "google" ||
              account.providerId === "github"
            ) {
              trackServerEvent(account.userId, "user_account_created", {
                method: "oauth",
                provider: account.providerId,
              });
            }
          } catch (error) {
            console.error("[Auth] Error in account.create.after hook:", error);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            console.log("[Auth] Session created:", session.userId);
            trackServerEvent(session.userId, "user_signed_in", {
              method: "email",
            });

            // Scope new sessions to the Wander org so the app loads in-context.
            if (!session.activeOrganizationId) {
              const wanderOrg = await db.query.organizationTable.findFirst({
                where: eq(schema.organizationTable.slug, "wander"),
              });
              if (wanderOrg) {
                await db
                  .update(schema.sessionTable)
                  .set({ activeOrganizationId: wanderOrg.id })
                  .where(eq(schema.sessionTable.id, session.id));
              }
            }
          } catch (error) {
            console.error("[Auth] Error in session.create.after hook:", error);
          }
        },
      },
      delete: {
        after: async (session) => {
          try {
            console.log("[Auth] Session deleted:", session.userId);
            trackServerEvent(session.userId, "user_signed_out", undefined);
          } catch (error) {
            console.error("[Auth] Error in session.delete.after hook:", error);
          }
        },
      },
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "https://kristianeboe-65.beta.localcan.dev",
    "https://growth-red.vercel.app",
    // Add your production domains and ngrok/localcan.dev tunnels here when deploying
    // Example: "https://yourapp.com", "https://yourapp-staging.localcan.dev"
  ],
  // Google OAuth - only enabled when credentials are configured
  ...(env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET && {
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
    }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"], // Auto-link Google accounts (emails verified by Google)
    },
  },
  plugins: [
    username(),
    admin({
      adminUserIds: [], // Add admin user IDs here when needed
      impersonationSessionDuration: 60 * 60, // 1 hour
    }),
    // Organization plugin (NEW)
    organization({
      teams: {
        enabled: true,
        maximumTeams: 10,
        maximumMembersPerTeam: 50,
      },
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 100,
      invitationLimit: 50,
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
      requireEmailVerificationOnInvitation: true,
      cancelPendingInvitationsOnReInvite: false,
      async sendInvitationEmail(data) {
        const inviteUrl = `${env.NEXT_PUBLIC_BASE_URL}/org-invite/${data.id}`;

        // Get inviter details
        const inviter = await db.query.userTable.findFirst({
          where: eq(schema.userTable.id, data.invitation.inviterId),
        });

        // Get organization details
        const organization = await db.query.organizationTable.findFirst({
          where: eq(
            schema.organizationTable.id,
            data.invitation.organizationId,
          ),
        });

        if (!inviter || !organization) {
          console.error("[Auth] Missing inviter or organization for email");
          return;
        }

        await sendTransactionalEmail(data.email, "organization_invitation", {
          organizationName: organization.name,
          inviterName: inviter.name ?? inviter.email ?? "Unknown",
          inviteUrl,
          role: data.role,
        });
      },
    }),
    // Next.js cookie helper - MUST be last plugin in array
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
