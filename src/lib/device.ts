export const MOBILE_APP_LANDING = "/app/review";
export const DESKTOP_APP_LANDING = "/app/next";

/** Conservative routing hint for choosing the first post-login surface. */
export function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}
