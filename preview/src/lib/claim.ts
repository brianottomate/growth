// The claim hand-off from a preview to app.wander.com.
//
// The receiving contract is app.wander.com's onboarding v3 (app#1519): claim
// params ride on `/auth/?redirect=/welcome?...`, survive sign-in, and after
// the org is created the app POSTs `/management/saas/website/claim-prospect`
// with `claimWebsiteId`. Shape ported verbatim from the sites renderer's
// buildProspectClaimUrl (sites#919) so both surfaces hand off identically.
//
// The fork this file adds: only a MONOLITH prospect has a `websiteId` the app
// can attach. A growth-native preview has no monolith identity, so sending
// claim params for it would produce a claim the backend cannot honour. Those
// previews get the same sign-up entry point with the business prefilled and
// no claim params, and the chrome says so rather than promising an attach.

export type ClaimIdentity =
  | { kind: "monolith"; websiteId: string; token: string }
  | { kind: "unclaimable"; reason: string };

type BuildClaimUrlInput = {
  appBaseUrl: string;
  businessName: string;
  website: string;
  identity: ClaimIdentity;
};

export function buildClaimUrl({
  appBaseUrl,
  businessName,
  website,
  identity,
}: BuildClaimUrlInput): string {
  const params: Record<string, string> = {
    intent: "build_brand",
    businessName,
    website,
  };

  if (identity.kind === "monolith") {
    params.claimWebsiteId = identity.websiteId;
    params.claimToken = identity.token;
  }

  const welcomeUrl = new URL("/welcome", appBaseUrl);
  welcomeUrl.search = new URLSearchParams(params).toString();

  const authUrl = new URL("/auth/", appBaseUrl);
  authUrl.searchParams.set(
    "redirect",
    `${welcomeUrl.pathname}${welcomeUrl.search}`,
  );
  return authUrl.toString();
}

/** Display host for "Compare with …" links and dialog subtitles. */
export function sourceDomainOf(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl || !URL.canParse(sourceUrl)) return undefined;
  return new URL(sourceUrl).hostname.replace(/^www\./, "");
}
