/**
 * Build a private, company-aware HubSpot email corpus for one prospect.
 *
 * Unlike the broad writing corpus, this intentionally preserves names,
 * company facts, subjects, message direction, and message copy. Direct email
 * addresses, phone numbers, raw headers, tracking URLs, and quoted history are
 * omitted. HubSpot remains unchanged.
 *
 *   bun --conditions=react-server scripts/build-hubspot-company-email-corpus.ts \
 *     --domain cascadiagetaways.com
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { findCompanyByDomain } from "@/server/clients/hubspot.client";
import { readHubspotCompanyEmailHistory } from "@/server/services/hubspot-company-email-context.service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const domain = arg("domain")?.trim().toLowerCase();
const requestedCompanyId = arg("company-id")?.trim();
if (!domain && !requestedCompanyId) {
  throw new Error("Pass --domain <domain> or --company-id <HubSpot ID>");
}

const company = domain ? await findCompanyByDomain(domain) : null;
const companyId = requestedCompanyId ?? company?.id;
if (!companyId) throw new Error(`No HubSpot company found for ${domain}`);

const history = await readHubspotCompanyEmailHistory(companyId, {
  limit: Number.parseInt(arg("limit") ?? "100", 10),
  maxBodyCharacters: Number.parseInt(arg("max-body-characters") ?? "4000", 10),
});
const outPath = resolve(
  arg("out") ??
    `reports/private/hubspot-company-email-corpus/${companyId}.json`,
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      domain: domain ?? null,
      ...history,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

console.log(
  JSON.stringify(
    {
      companyId,
      domain: domain ?? null,
      available: history.available,
      retained: history.retained,
      inbound: history.inbound,
      outbound: history.outbound,
      outPath,
    },
    null,
    2,
  ),
);
