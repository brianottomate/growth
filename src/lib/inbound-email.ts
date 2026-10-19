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

/** Extract the opaque, case-sensitive brand ID (or slug) from a recipient. */
export function parseInspirationToken(recipients: string[]): string | null {
  const match = /inspo\+([^@>,\s]+)@/i.exec(recipients.join(","));
  return match?.[1] ?? null;
}

/**
 * Inbound address for affiliate-program mail. The partnerships@wander.com
 * Google group forward-copies here (humans keep Gmail; the system gets a copy
 * of every partner email, including Impact's own notification emails). The
 * `affiliate+<programId>` token resolves the partner_program at ingest time.
 */
export function affiliateAddress(programId: string): string {
  return `affiliate+${programId}@${RESEND_RECEIVING_DOMAIN}`;
}
