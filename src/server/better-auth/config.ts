import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin,
  bearer,
  genericOAuth,
  jwt,
  username,
  organization,
} from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { sendTransactionalEmail } from "@/server/clients/resend.client";
import {
  trackServerEvent,
  identifyServerUser,
} from "@/server/services/analytics.service";
import {
  GROWTH_AUTH_ISSUER,
  GROWTH_MCP_RESOURCE,
  GROWTH_MCP_SCOPE,
  GROWTH_OAUTH_SCOPES,
} from "@/server/mcp/config";

// External collaborators allowed past the @wander.com sign-up gate. Keep this
// short and intentional — each entry is a deliberate exception. Lowercase only
// (emails are normalized before the check).
const ALLOWED_EXTERNAL_EMAILS = new Set<string>([
  "hashimwarren@gmail.com", // Hashim Warren
]);

function authHost(value: string | undefined) {
  if (!value) return undefined;

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return undefined;
  }
}

const authAllowedHosts = Array.from(
  new Set(
    [
      "localhost:3000",
      process.env.NODE_ENV === "development" ? "localhost:*" : undefined,
      // Canonical production host, listed explicitly so auth URL resolution
      // (and OAuth callback host) works even when the Vercel-injected env vars
      // below don't cover a custom alias. A custom domain would have to be
      // added here AND to the Google client's redirect URIs before it could
      // carry a session, so don't list one pre-emptively.
      "growth-red.vercel.app",
      authHost(env.NEXT_PUBLIC_BASE_URL),
      authHost(process.env.VERCEL_URL),
      authHost(process.env.VERCEL_BRANCH_URL),
      authHost(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    ].filter((host): host is string => Boolean(host)),
  ),
);

async function hasOrganizationAccess(userId: string, organizationId: string) {
  return db.query.memberTable.findFirst({
    where: and(
      eq(schema.memberTable.userId, userId),
      eq(schema.memberTable.organizationId, organizationId),
    ),
    columns: { id: true },
  });
}

export const auth = betterAuth({
  // Resolve auth URLs from approved request hosts so canonical, preview, and
  // local sessions work without trusting arbitrary Host headers.
  baseURL: {
    allowedHosts: authAllowedHosts,
    protocol: "auto",
    fallback: env.NEXT_PUBLIC_BASE_URL,
  },
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
      jwks: schema.jwksTable,
      oauthClient: schema.oauthClientTable,
      oauthRefreshToken: schema.oauthRefreshTokenTable,
      oauthAccessToken: schema.oauthAccessTokenTable,
      oauthConsent: schema.oauthConsentTable,
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
          if (
            !email.endsWith("@wander.com") &&
            !ALLOWED_EXTERNAL_EMAILS.has(email)
          ) {
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
              console.log(`[Auth] Added ${user.email} to Wander org as member`);
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
    "https://chatgpt.com",
    "https://claude.ai",
    "https://*.claude.ai",
    // Add your production domains and ngrok/localcan.dev tunnels here when deploying
    // Example: "https://yourapp.com", "https://yourapp-staging.localcan.dev"
    // Dev only: port 3000 is often taken by another project, so trust every
    // localhost port (Better Auth supports wildcard origin patterns).
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:*"] : []),
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
    // Preserve bearer-session support for the app's server API while MCP
    // clients use OAuth access tokens below.
    bearer(),
    /**
     * Google Drive as its own linked account — deliberately NOT extra scopes on
     * the Google sign-in provider above.
     *
     * Google revokes per app grant rather than per scope, so a shared client
     * would mean "revoke Drive" also logs the person out of Growth. And with
     * account linking enabled, asking the sign-in provider for Drive would hand
     * email/password users a Google login they never opted into.
     *
     * The plugin registers this into `socialProviders` internally, so
     * `auth.api.getAccessToken({ providerId: "google-drive" })` still handles
     * refresh — separation costs us no token plumbing.
     */
    genericOAuth({
      config:
        env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET
          ? [
              {
                providerId: "google-drive",
                clientId: env.GOOGLE_DRIVE_CLIENT_ID,
                clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
                discoveryUrl:
                  "https://accounts.google.com/.well-known/openid-configuration",
                // `profile` is not optional here: the plugin resolves the
                // account against Google's userinfo and rejects a response with
                // no name (`name_is_missing`).
                scopes: [
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/drive.readonly",
                ],
                // Google only returns a refresh token when both are set, and
                // only re-issues one on an explicit consent prompt.
                accessType: "offline",
                prompt: "consent",
                pkce: true,
              },
            ]
          : [],
    }),
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
    jwt({
      jwt: { issuer: GROWTH_AUTH_ISSUER },
    }),
    oauthProvider({
      loginPage: "/signin",
      consentPage: "/consent",
      scopes: [...GROWTH_OAUTH_SCOPES],
      validAudiences: [GROWTH_MCP_RESOURCE],
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: [...GROWTH_OAUTH_SCOPES],
      clientRegistrationAllowedScopes: [...GROWTH_OAUTH_SCOPES],
      silenceWarnings: { oauthAuthServerConfig: true },
      postLogin: {
        page: "/oauth/workspace",
        shouldRedirect: ({ scopes }) => scopes.includes(GROWTH_MCP_SCOPE),
        consentReferenceId: async ({ user, session, scopes }) => {
          if (!scopes.includes(GROWTH_MCP_SCOPE)) return undefined;
          const organizationId = session.activeOrganizationId;
          if (typeof organizationId !== "string") {
            throw new Error("Choose a Wander Growth organization to continue");
          }
          const membership = await hasOrganizationAccess(
            user.id,
            organizationId,
          );
          if (!membership) {
            throw new Error("You no longer have access to that organization");
          }
          return organizationId;
        },
      },
      customAccessTokenClaims: async ({ user, referenceId, scopes }) => {
        if (!scopes.includes(GROWTH_MCP_SCOPE)) return {};
        if (!user?.id || !referenceId) {
          throw new Error("The OAuth grant is not attached to an organization");
        }
        const membership = await hasOrganizationAccess(user.id, referenceId);
        if (!membership) {
          throw new Error("You no longer have access to that organization");
        }
        return { org_id: referenceId };
      },
    }),
    // Next.js cookie helper - MUST be last plugin in array
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
