import { APIError } from "better-auth/api";

type MembershipLookup = (
  userId: string,
) => Promise<{ organizationId: string } | undefined>;

/** Shared OAuth policy; the caller supplies the live Wander membership lookup. */
export function wanderOAuthPolicy(
  lookup: MembershipLookup,
  growthScope: string,
) {
  return {
    postLogin: {
      page: "/consent",
      shouldRedirect: () => false,
      consentReferenceId: async ({
        user,
        scopes,
      }: {
        user: { id: string };
        scopes: string[];
      }) => {
        if (!scopes.includes(growthScope)) return undefined;
        const membership = await lookup(user.id);
        if (!membership)
          throw new APIError("FORBIDDEN", {
            message: "You do not have access to Wander Growth",
          });
        return membership.organizationId;
      },
    },
    customAccessTokenClaims: async ({
      user,
      referenceId,
      scopes,
    }: {
      user?: { id: string } | null;
      referenceId?: string | null;
      scopes: string[];
    }) => {
      if (!scopes.includes(growthScope)) return {};
      if (!user?.id || !referenceId)
        throw new Error("The OAuth grant is not attached to Wander Growth");
      const membership = await lookup(user.id);
      if (!membership || membership.organizationId !== referenceId)
        throw new APIError("FORBIDDEN", {
          message: "You no longer have access to Wander Growth",
        });
      return { org_id: referenceId };
    },
  };
}
