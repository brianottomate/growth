import { brandMarketingDomainSchema } from "./email-dns";

export const GROWTH_CLIENT_URL = "https://growth-red.vercel.app";

/** Private client credentials must never be returned for a guessable slug. */
export function privatePerformanceLinks(
  byToken: boolean,
  token: string | null,
  marketingDomain: unknown,
) {
  const setup = brandMarketingDomainSchema.safeParse(marketingDomain);
  return {
    connect:
      byToken && token
        ? `${GROWTH_CLIENT_URL}/connect/${encodeURIComponent(token)}`
        : null,
    emailDns:
      byToken && setup.success && Date.parse(setup.data.expiresAt) > Date.now()
        ? `${GROWTH_CLIENT_URL}/connect/email/${encodeURIComponent(setup.data.token)}`
        : null,
  };
}
