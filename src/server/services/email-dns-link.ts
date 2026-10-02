import type { BrandMarketingDomain } from "@/lib/email-dns";
import { isConnectionToken } from "./connection-token";

export function emailDnsLinkActive(
  setup: BrandMarketingDomain,
  now = Date.now(),
) {
  return isConnectionToken(setup.token) && Date.parse(setup.expiresAt) > now;
}
