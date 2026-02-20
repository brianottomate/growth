/**
 * Server-side instrumentation
 *
 * Captures server-side errors and sends them to PostHog.
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export function register() {
  // No-op for initialization
}

export const onRequestError = async (
  err: Error,
  request: Request,
  _context: { routerKind?: "Pages Router" | "App Router" },
) => {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureException } =
      await import("@/server/clients/posthog.client");

    try {
      // Extract distinct_id from PostHog cookie
      let distinctId: string | undefined;

      if (request.headers.get("cookie")) {
        const cookieString = request.headers.get("cookie")!;
        const postHogCookieMatch = /ph_phc_.*?_posthog=([^;]+)/.exec(
          cookieString,
        );

        if (postHogCookieMatch?.[1]) {
          try {
            const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
            const postHogData = JSON.parse(decodedCookie) as {
              distinct_id: string;
            };
            distinctId = postHogData.distinct_id;
          } catch (e) {
            console.error("[PostHog] Error parsing cookie:", e);
          }
        }
      }

      // Capture the exception (will throw if PostHog not configured)
      await captureException(err, distinctId);
    } catch (captureError) {
      // Silently fail - error tracking should never break the app
      console.error(
        "[PostHog] Failed to capture exception (PostHog may not be configured):",
        captureError,
      );
    }
  }
};
