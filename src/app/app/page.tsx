import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  DESKTOP_APP_LANDING,
  isMobileUserAgent,
  MOBILE_APP_LANDING,
} from "@/lib/device";

export default async function AppPage() {
  const userAgent = (await headers()).get("user-agent");
  redirect(
    isMobileUserAgent(userAgent) ? MOBILE_APP_LANDING : DESKTOP_APP_LANDING,
  );
}
