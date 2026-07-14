import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/server/better-auth";

/** RFC 8414 path-aware discovery for the `/api/auth` issuer. */
export const GET = oauthProviderAuthServerMetadata(auth, {
  headers: { "Cache-Control": "public, max-age=300" },
});
