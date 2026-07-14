import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/server/better-auth";

/** OpenID discovery for clients that prefer OIDC metadata. */
export const GET = oauthProviderOpenIdConfigMetadata(auth);
