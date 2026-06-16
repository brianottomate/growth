// The Resend inbound receiving domain — the address F5Bot alerts and forwarded
// competitor newsletters both land on (catch-all → /api/webhooks/resend).
export const RESEND_RECEIVING_DOMAIN = "lexaomo.resend.app";

/**
 * Per-brand inbound address for forwarding a competitor's newsletter. The
 * `inspo+<brandId>` token names the reference brand the issue belongs to, so a
 * forwarded issue resolves to its brand by deterministic lookup at ingest time
 * (see inspiration-newsletter.service.ts), with no fuzzy sender matching.
 */
export function inspirationAddress(brandId: string): string {
  return `inspo+${brandId}@${RESEND_RECEIVING_DOMAIN}`;
}
