import "server-only";

import { env } from "@/env";

/**
 * Fetch a Customer.io newsletter's rendered HTML body + subject (App API).
 * Basic preview source for the newsletter wall / reader / detail view.
 * Returns null on any failure so callers degrade gracefully.
 */
export async function fetchNewsletterContent(
  cioId: string,
): Promise<{ body: string; subject: string | null } | null> {
  const headers = { Authorization: `Bearer ${env.CUSTOMER_IO_APP_KEY}` };
  try {
    const [cRes, mRes] = await Promise.all([
      fetch(`https://api.customer.io/v1/newsletters/${cioId}/contents`, { headers }),
      fetch(`https://api.customer.io/v1/newsletters/${cioId}/messages?limit=1`, { headers }),
    ]);
    if (!cRes.ok) return null;
    const cJson = (await cRes.json()) as {
      contents?: { body?: string; subject?: string }[];
    };
    const content = cJson.contents?.[0];
    if (!content?.body) return null;
    let subject = content.subject ?? null;
    if (!subject && mRes.ok) {
      const mJson = (await mRes.json()) as { messages?: { subject?: string }[] };
      subject = mJson.messages?.[0]?.subject ?? null;
    }
    return { body: content.body, subject };
  } catch {
    return null;
  }
}
