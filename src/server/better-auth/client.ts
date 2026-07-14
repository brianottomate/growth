import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  usernameClient,
  organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient(),
    organizationClient(), // NEW
    oauthProviderClient(),
  ],
});

export type Session = typeof authClient.$Infer.Session;
