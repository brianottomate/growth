import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

/**
 * Route auth for the HTTP channel — fails closed in production:
 * - vercelOidc(): Vercel-minted OIDC bearers for this project (covers
 *   `eve dev <deployment-url>` as a project member, cron, and
 *   Vercel-to-Vercel callers).
 * - localDev(): loopback-only synthetic principal for local runs.
 *
 * Public browser traffic is rejected — correct for a staging scanner.
 * If ops needs credentialed curl access, add
 * `httpBasic({ operator: process.env.ROUTE_AUTH_BASIC_PASSWORD! })`
 * ahead of localDev(). /eve/v1/health stays public for uptime checks.
 */
export default eveChannel({
  auth: [vercelOidc(), localDev()],
});
