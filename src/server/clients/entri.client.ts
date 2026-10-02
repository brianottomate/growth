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
