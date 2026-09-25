import "server-only";

import { env } from "@/env";
import { createGoogleAdsTransport } from "./google-ads.transport";

export const googleAdsClient = createGoogleAdsTransport({
  developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
  loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  serviceAccountJson: env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON,
  clientId: env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN,
});
