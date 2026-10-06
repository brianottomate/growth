import "server-only";
import { env } from "@/env";
import type { EmailDnsRecord } from "@/lib/email-dns";

export function isEntriConfigured() {
  return Boolean(
    env.SAAS_ENTRI_APPLICATION_ID && env.SAAS_ENTRI_APPLICATION_SECRET,
  );
}

/** Bind the browser token to this zone, these records, and DNS Connect only. */
export async function createEmailEntriConfig(input: {
  rootDomain: string;
  brandId: string;
  records: EmailDnsRecord[];
}) {
  if (!isEntriConfigured())
    throw new Error(
      "Automatic DNS setup is unavailable. Use the manual records below or contact Wander.",
    );
  const response = await fetch("https://api.goentri.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: env.SAAS_ENTRI_APPLICATION_ID,
      secret: env.SAAS_ENTRI_APPLICATION_SECRET,
      domain: input.rootDomain,
      dnsRecords: input.records,
      product: "connect",
      userId: `growth-email:${input.brandId}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      "Automatic DNS setup could not open. Use the manual records or contact Wander.",
    );
  const data = (await response.json()) as { auth_token?: string };
  if (!data.auth_token)
    throw new Error("Automatic DNS setup returned no session.");
  return {
    applicationId: env.SAAS_ENTRI_APPLICATION_ID!,
    token: data.auth_token,
    prefilledDomain: input.rootDomain,
    dnsRecords: input.records,
    userId: `growth-email:${input.brandId}`,
    applicationName: "Wander",
    wwwRedirect: false,
    secureRootDomain: false,
    checkConflicts: true,
    validateDmarc: true,
  };
}

export type EntriShareRecord =
  | EmailDnsRecord
  | { type: "MX"; host: string; value: string; priority: number; ttl: number };

/**
 * A hosted Entri Connect link (`app.goentri.com/share/...`) for these
 * records, for a client who should not need a Growth page.
 * https://developers.entri.com/connect/shared-links
 */
export async function createEntriShareLink(input: {
  rootDomain: string;
  brandId: string;
  records: EntriShareRecord[];
}) {
  if (!isEntriConfigured()) throw new Error("Entri is not configured.");
  const applicationId = env.SAAS_ENTRI_APPLICATION_ID!;
  const auth = await fetch("https://api.goentri.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId,
      secret: env.SAAS_ENTRI_APPLICATION_SECRET,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const { auth_token: token } = (await auth.json()) as { auth_token?: string };
  if (!token) throw new Error(`Entri token request failed (${auth.status}).`);
  const response = await fetch("https://api.goentri.com/sharing/connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      applicationId,
    },
    body: JSON.stringify({
      applicationId,
      // The share page reads only `config`, which must name the app itself.
      config: {
        applicationId,
        prefilledDomain: input.rootDomain,
        dnsRecords: input.records,
        userId: `growth-email:${input.brandId}`,
        applicationName: "Wander",
        wwwRedirect: false,
        secureRootDomain: false,
        checkConflicts: true,
        validateDmarc: true,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Entri share link failed (${response.status}): ${body}`);
  return JSON.parse(body) as { link: string; job_id: string };
}
