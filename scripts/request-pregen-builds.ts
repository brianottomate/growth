/**
 * Request pregen site builds for a batch of domains.
 *
 * The only other door to a build is the per-row button in `/app/leads`, which
 * is fine for one prospect and tedious for ten. This mirrors the
 * `leads.requestPregenSite` mutation exactly — same exclusion gate, same
 * in-flight check, same unique-prospect conflict handling — so a batch fired
 * from here is indistinguishable from ten clicks.
 *
 * WanderOS returns as soon as the prospect record exists; the build runs async
 * (~10-30 min) and reports back over the prospect webhook. The `status` printed
 * here means "accepted", never "built".
 *
 * The API target comes from WANDER_API_URL / WANDER_API_KEY. `.env` points at
 * staging by design, and the DB points at prod — mixing those writes prod build
 * rows holding staging prospect ids that the prod webhook can never settle. To
 * fire real builds, pass prod values inline for the one run rather than editing
 * `.env`, so the guardrail stays armed afterwards:
 *
 *   WANDER_API_URL=https://api.wander.com WANDER_API_KEY=<prod key> \
 *     bun --conditions=react-server scripts/request-pregen-builds.ts --apply a.com b.com
 *
 * Dry run (default — resolves and reports, asks WanderOS for nothing):
 *   bun --conditions=react-server scripts/request-pregen-builds.ts a.com b.com
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable, pregenBuildTable } from "@/server/db/leads-schema";
import {
  createWebsiteProspect,
  isWanderApiConfigured,
} from "@/server/clients/wander.client";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const domains = argv
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => arg.trim().toLowerCase())
  .filter(Boolean);

if (!domains.length) {
  throw new Error(
    "Pass at least one domain: scripts/request-pregen-builds.ts [--apply] <domain> ...",
  );
}
if (apply && !isWanderApiConfigured) {
  throw new Error(
    "WANDER_API_URL and WANDER_API_KEY must both be set to apply",
  );
}

type Outcome = {
  domain: string;
  action: "requested" | "would-request" | "skipped";
  reason?: string;
  prospectId?: string | null;
  websiteId?: string | null;
  previewToken?: string | null;
  previewUrl?: string | null;
  status?: string | null;
};

const outcomes: Outcome[] = [];

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      api: process.env.WANDER_API_URL ?? null,
      domains: domains.length,
    },
    null,
    2,
  ),
);

for (const domain of domains) {
  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
  });
  if (!row) {
    outcomes.push({ domain, action: "skipped", reason: "not in leads.domain" });
    continue;
  }

  // Same suppression rule as the mutation. Currently a no-op (the flag was
  // cleared across the table on 2026-08-12) but kept so re-applying an
  // exclusion later is honoured here without anyone remembering this script.
  if (row.excludeFromOutreach) {
    outcomes.push({
      domain,
      action: "skipped",
      reason: `excluded from outreach (${row.excludeReason ?? "no reason recorded"})`,
    });
    continue;
  }

  const inFlight = await db.query.pregenBuildTable.findFirst({
    where: and(
      eq(pregenBuildTable.domainId, row.id),
      isNull(pregenBuildTable.settledAt),
    ),
  });
  if (inFlight) {
    outcomes.push({
      domain,
      action: "skipped",
      reason: `build already in flight (${inFlight.status ?? "requested"})`,
      prospectId: inFlight.prospectId,
    });
    continue;
  }

  const businessName = row.companyName ?? row.domain;
  const sourceUrl = `https://${row.domain}`;

  if (!apply) {
    outcomes.push({ domain, action: "would-request" });
    continue;
  }

  const prospect = await createWebsiteProspect({ businessName, sourceUrl });

  // The in-flight check above is a read-then-write and cannot hold under
  // concurrency; the unique prospectId index is the real serialization point.
  // A collision means this prospect already has a build row, so fall back to
  // reading it rather than treating the raw Postgres error as a failure.
  const [build] = await db
    .insert(pregenBuildTable)
    .values({
      domainId: row.id,
      domain: row.domain,
      prospectId: prospect.id,
      websiteId: prospect.websiteId,
      previewToken: prospect.previewToken ?? null,
      businessName,
      sourceUrl,
      status: prospect.status,
      previewUrl: prospect.previewUrl ?? null,
    })
    .onConflictDoNothing({ target: pregenBuildTable.prospectId })
    .returning();

  const settled =
    build ??
    (
      await db
        .select()
        .from(pregenBuildTable)
        .where(eq(pregenBuildTable.prospectId, prospect.id))
        .limit(1)
    )[0];

  outcomes.push({
    domain,
    action: "requested",
    prospectId: settled?.prospectId ?? prospect.id,
    websiteId: settled?.websiteId ?? prospect.websiteId,
    previewToken: settled?.previewToken ?? prospect.previewToken ?? null,
    previewUrl: settled?.previewUrl ?? prospect.previewUrl ?? null,
    status: settled?.status ?? prospect.status,
  });
}

console.log(JSON.stringify(outcomes, null, 2));
console.log(
  JSON.stringify(
    {
      requested: outcomes.filter((o) => o.action === "requested").length,
      wouldRequest: outcomes.filter((o) => o.action === "would-request").length,
      skipped: outcomes.filter((o) => o.action === "skipped").length,
    },
    null,
    2,
  ),
);
