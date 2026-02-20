import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, anonymous, username, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendTransactionalEmail } from "@/server/clients/resend.client";
import {
  trackServerEvent,
  identifyServerUser,
} from "@/server/services/analytics.service";

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
    requireEmailVerification: true,
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
    sendOnSignUp: true,
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
  // Endpoint Hooks - Access to request context
  // ─────────────────────────────────────────────────
  // Use hooks.after when you need access to request context (headers, query params, etc.)
  // that isn't available in databaseHooks. This runs as part of the auth flow,
  // so there's no additional performance overhead.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Only handle anonymous sign-in endpoint (early return for all other endpoints)
      if (ctx.path !== "/sign-in/anonymous") return;

      const newSession = ctx.context.newSession;
      if (!newSession?.user) return;

      // Read source from custom header (passed from client via fetchOptions)
      // This lets us track where anonymous users are coming from for analytics
      const sourceHeader = ctx.headers?.get("x-anonymous-source");
      const source = sourceHeader ?? "direct";

      // Track anonymous user creation with specific source
      if (newSession.user.isAnonymous) {
        console.log(
          `[Auth] Anonymous user created: ${newSession.user.id} (source: ${source})`,
        );
        // Note: No need to identify anonymous users with fake emails
        trackServerEvent(newSession.user.id, "anonymous_user_created", {
          source,
        });
      }
    }),
  },
  // ─────────────────────────────────────────────────
  // Database Hooks - Lifecycle events
  // ─────────────────────────────────────────────────
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            // Anonymous users are tracked in hooks.after (where we have request context)
            if (user.isAnonymous) {
              console.log("[Auth] Anonymous user created:", user.id);
              return;
            }

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
    anonymous({
      emailDomainName: "anonymous.example.com",
      generateName: () => `Guest-${crypto.randomUUID().slice(0, 8)}`,
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        console.log(
          `[Auth] Transferring data from anonymous user ${anonymousUser.user.id} to ${newUser.user.id}`,
        );

        try {
          // Import and call the transfer service
          const { transferAnonymousUserData } =
            await import("@/server/services/anonymous.service");

          await transferAnonymousUserData(
            anonymousUser.user.id,
            newUser.user.id,
          );

          console.log(`[Auth] Data transfer completed successfully`);

          // Calculate days between anonymous user creation and conversion
          const anonCreatedAt = new Date(anonymousUser.user.createdAt);
          const conversionTime = new Date(newUser.user.createdAt);
          const daysSinceCreation = Math.floor(
            (conversionTime.getTime() - anonCreatedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );

          // Track the conversion event
          trackServerEvent(newUser.user.id, "anonymous_user_converted", {
            previousUserId: anonymousUser.user.id,
            daysSinceCreation,
          });

          // Identify the real user (replaces anonymous profile)
          identifyServerUser(newUser.user.id, {
            email: newUser.user.email,
            name: newUser.user.name ?? undefined,
          });

          console.log(
            `[Auth] Anonymous user ${anonymousUser.user.id} converted to ${newUser.user.id}`,
          );
        } catch (error) {
          console.error("[Auth] Error in onLinkAccount:", error);
          // Don't throw - Better Auth will still complete the conversion
        }
      },
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
