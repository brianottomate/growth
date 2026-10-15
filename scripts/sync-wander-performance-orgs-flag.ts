/**
 * One-off: put every signed Performance client's WanderOS org on the backend
 * Amplitude flag `wander-performance-orgs`, which grants complimentary
 * Discovery Agent access (wandercom/wander#22335).
 *
 * Signed = performance_account.status 'active' with signedAt set. Org ids come
 * from the brand's WanderOS website via the SaasWebsite BigQuery mirror.
 *
 * The flag must live in the backend Experiment project (prod 769889), not the
 * app.wander.com project, and match the shape the monolith reads: local
 * evaluation, device_id bucketing (device_id = organizationId), variant `on`,
 * no rollout. When it is missing, --apply creates it with the deployments of
 * `skip-subscription-discoverability`, which already works for the backend.
 *
 * Dry run by default. --apply writes. --prune also removes orgs not in the set.
 * --exclude takes brand slugs (e.g. orgs that should get a trial instead).
 *
 *   AMPLITUDE_MANAGEMENT_API_KEY=... bun --conditions=react-server \
 *     scripts/sync-wander-performance-orgs-flag.ts [--apply] [--prune] \
 *     [--exclude pmi-southwest-florida,pmi-summit-colorado]
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, performanceAccountTable } from "@/server/db/schema";
import { executeQuery } from "@/server/clients/bigquery.client";

const FLAG_KEY = "wander-performance-orgs";
const TEMPLATE_FLAG_KEY = "skip-subscription-discoverability";
const VARIANT = "on";
const PROJECT_ID = process.env.AMPLITUDE_EXPERIMENT_PROJECT_ID ?? "769889";
const API = "https://experiment.amplitude.com/api/1";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const prune = args.includes("--prune");
const excludeIndex = args.indexOf("--exclude");
const excluded = new Set(
  excludeIndex >= 0 ? (args[excludeIndex + 1] ?? "").split(",") : [],
);

const token = process.env.AMPLITUDE_MANAGEMENT_API_KEY;
if (!token) throw new Error("Set AMPLITUDE_MANAGEMENT_API_KEY.");

async function amplitude<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${response.status} ${text}`,
    );
  return (text ? JSON.parse(text) : undefined) as T;
}

type Flag = {
  id: string;
  key: string;
  enabled: boolean;
  evaluationMode: string;
  bucketingKey: string;
  rolloutPercentage: number;
  deployments: string[];
};

async function findFlag(key: string) {
  const { flags } = await amplitude<{ flags: Flag[] }>(
    `/flags?projectId=${PROJECT_ID}&key=${encodeURIComponent(key)}`,
  );
  return flags.find((flag) => flag.key === key) ?? null;
}

// 1. Signed Performance clients and their WanderOS sites.
const accounts = await db
  .select({
    name: performanceAccountTable.name,
    slug: brandTable.slug,
    websiteId: brandTable.wanderOsWebsiteId,
  })
  .from(performanceAccountTable)
  .leftJoin(brandTable, eq(brandTable.id, performanceAccountTable.brandId))
  .where(
    and(
      eq(performanceAccountTable.status, "active"),
      isNotNull(performanceAccountTable.signedAt),
      isNull(performanceAccountTable.deletedAt),
    ),
  );

// 2. Website → organization from the monolith mirror.
const websiteIds = accounts.flatMap((a) => (a.websiteId ? [a.websiteId] : []));
const sites = await executeQuery<{
  id: string;
  organizationId: string | null;
  domain: string | null;
}>(
  "SELECT id, organizationId, domain FROM `wander-9fc9c.wos_datastream.public_SaasWebsite` WHERE id IN UNNEST(@websiteIds)",
  { websiteIds },
);
const siteById = new Map(sites.map((site) => [site.id, site]));

const rows = accounts.map((account) => {
  const site = account.websiteId ? siteById.get(account.websiteId) : undefined;
  const organizationId = site?.organizationId ?? null;
  const skip = excluded.has(account.slug ?? "")
    ? "excluded"
    : !account.websiteId
      ? "no WanderOS site"
      : !organizationId
        ? "site has no org"
        : null;
  return {
    name: account.name,
    slug: account.slug,
    organizationId,
    domain: site?.domain ?? null,
    skip,
    // The grant cron only scans orgs with a live custom domain.
    note:
      organizationId && !site?.domain
        ? "no custom domain: cron won't grant"
        : "",
  };
});
const desired = new Set(
  rows.flatMap((row) =>
    !row.skip && row.organizationId ? [row.organizationId] : [],
  ),
);

// 3. The flag, created in the backend shape when missing.
let flag = await findFlag(FLAG_KEY);
if (!flag) {
  const template = await findFlag(TEMPLATE_FLAG_KEY);
  if (!template)
    throw new Error(`${TEMPLATE_FLAG_KEY} not found in project ${PROJECT_ID}.`);
  console.log(
    `${FLAG_KEY} missing in project ${PROJECT_ID}; would create it (local, device_id, deployments ${template.deployments.join(", ")}).`,
  );
  if (apply) {
    const created = await amplitude<{ id: string; url: string }>("/flags", {
      method: "POST",
      body: {
        projectId: PROJECT_ID,
        key: FLAG_KEY,
        name: FLAG_KEY,
        description:
          "Complimentary Discovery Agent for signed Wander Performance orgs. Device ID = organizationId.",
        variants: [{ key: VARIANT }],
        bucketingKey: "device_id",
        evaluationMode: "local",
        rolloutWeights: { [VARIANT]: 1 },
        deployments: template.deployments,
      },
    });
    console.log(`Created ${created.url}`);
    flag = await findFlag(FLAG_KEY);
  }
}

if (flag) {
  const shapeProblems = [
    flag.evaluationMode !== "local" && `evaluationMode=${flag.evaluationMode}`,
    flag.bucketingKey !== "device_id" && `bucketingKey=${flag.bucketingKey}`,
    flag.rolloutPercentage !== 0 &&
      `rolloutPercentage=${flag.rolloutPercentage}`,
    flag.deployments.length === 0 && "no deployments",
  ].filter(Boolean);
  if (shapeProblems.length)
    throw new Error(
      `${FLAG_KEY} has the wrong shape: ${shapeProblems.join(", ")}. Fix it in Amplitude first.`,
    );
}

// 4. Diff inclusions on the `on` variant.
const current = new Set<string>(
  flag
    ? (
        await amplitude<Array<string | { id?: string; userId?: string }>>(
          `/flags/${flag.id}/variants/${VARIANT}/users`,
        )
      ).map((entry) => {
        const id =
          typeof entry === "string" ? entry : (entry.id ?? entry.userId);
        if (!id)
          throw new Error(`Unrecognised inclusion: ${JSON.stringify(entry)}`);
        return id;
      })
    : [],
);
const toAdd = [...desired].filter((id) => !current.has(id));
const toRemove = [...current].filter((id) => !desired.has(id));

console.table(
  rows.map((row) => ({
    ...row,
    action: row.skip
      ? `skip (${row.skip})`
      : current.has(row.organizationId!)
        ? "already on"
        : "add",
  })),
);
console.log(
  `Add ${toAdd.length}. Not in Growth's set: ${toRemove.length}${toRemove.length ? ` (${toRemove.join(", ")})` : ""}${toRemove.length && !prune ? " — kept; pass --prune to remove" : ""}.`,
);

if (!apply) {
  console.log("Dry run. Pass --apply to write.");
  process.exit(0);
}
if (!flag) throw new Error("Flag still missing after create.");

if (toAdd.length)
  await amplitude(`/flags/${flag.id}/variants/${VARIANT}/users`, {
    method: "POST",
    body: { inclusions: toAdd },
  });
if (prune && toRemove.length)
  await amplitude(`/flags/${flag.id}/variants/${VARIANT}/bulk-delete-users`, {
    method: "DELETE",
    body: { users: toRemove },
  });
if (!flag.enabled)
  await amplitude(`/flags/${flag.id}`, {
    method: "PATCH",
    body: { enabled: true },
  });

console.log(
  `Done. ${FLAG_KEY} (${flag.id}) enabled with ${desired.size} orgs; the hourly reconcile at :40 grants them.`,
);
process.exit(0);
