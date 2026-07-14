import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/server/better-auth";

/** RFC 8414 discovery for ChatGPT, Claude, and other OAuth clients. */
export const GET = oauthProviderAuthServerMetadata(auth);
