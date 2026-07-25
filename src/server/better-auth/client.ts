import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  genericOAuthClient,
  usernameClient,
  organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient(),
    organizationClient(), // NEW
    genericOAuthClient(), // Google Drive, kept separate from Google sign-in
    oauthProviderClient(),
  ],
});

export type Session = typeof authClient.$Infer.Session;
