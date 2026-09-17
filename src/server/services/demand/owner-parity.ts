/**
 * Loop guard for the HubSpot → Customer.io BDR parity webhook.
 *
 * Every `demand__bdr` write the sync makes comes straight back as a
 * `contact.propertyChange` event. Mirroring those to Customer.io would be
 * harmless but pointless; mirroring a *human's* change is the whole reason
 * the webhook exists. HubSpot stamps the origin on each event as
 * `changeSource`, so the distinction is one string check — the same idea as
 * `actor.type === "User"` on the Outreach side.
 *
 * Pure so the rule can be tested without a request.
 */

export const DEMAND_BDR_PROPERTY = "demand__bdr";

/** Sources that mean "our own private app wrote this". */
const OWN_WRITE_SOURCES: ReadonlySet<string> = new Set([
  "API",
  "INTEGRATION",
  "INTEGRATIONS_PLATFORM",
]);

/**
 * True when a `demand__bdr` change came from a person (or a HubSpot workflow
 * acting on their behalf) rather than from this app's API writes. A missing
 * source is treated as ours: a silent echo is cheaper than a wrong mirror.
 */
export function shouldMirrorDemandBdrChange(
  changeSource: string | null | undefined,
): boolean {
  if (!changeSource) return false;
  return !OWN_WRITE_SOURCES.has(changeSource.toUpperCase());
}
