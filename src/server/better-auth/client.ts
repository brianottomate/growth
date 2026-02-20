import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  anonymousClient,
  usernameClient,
  organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient(),
    anonymousClient(),
    organizationClient(), // NEW
  ],
});

export type Session = typeof authClient.$Infer.Session;
