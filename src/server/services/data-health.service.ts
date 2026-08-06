import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * Data-health introspection for the /app/engineering view. This is a read-only
 * "view on top of the database": it discovers every table from the Postgres
 * catalog (so it never drifts when a new domain schema lands — an unmapped
 * table just surfaces under "Unmapped", which is itself a useful signal),
 * counts real-vs-seed rows, and reports the last write. The point is to see at
 * a glance what's wired up vs. what looks weirdly empty.
 */

export type TableStatus = "empty" | "seed_only" | "live";

export type TableStat = {
  schema: string;
  name: string;
  domain: string;
  total: number;
  seed: number;
  real: number;
  lastWrite: Date | null;
  status: TableStatus;
};

export type DomainGroup = {
  domain: string;
  tables: TableStat[];
  tableCount: number;
  populated: number; // tables with at least one real (non-seed) row
  totalRows: number;
};

export type DataHealth = {
  groups: DomainGroup[];
  scannedAt: Date;
  totalTables: number;
  totalRows: number;
  emptyTables: TableStat[]; // empty + seed-only, the "needs attention" list
};

// Maps each physical table to a human domain. Mirrors the domain-split schema
// files under src/server/db. A table missing here lands in "Unmapped" — which
// flags that this map (and CLAUDE.md) should be updated.
const DOMAIN_BY_TABLE: Record<string, string> = {
  // auth-schema
  user: "Auth",
  session: "Auth",
  account: "Auth",
  verification: "Auth",
  organization: "Auth",
  member: "Auth",
  team: "Auth",
  team_member: "Auth",
  invitation: "Auth",
  // brand-schema
  brand: "Brand",
  brand_inspiration: "Brand",
  access: "Brand",
  // channel-schema
  channel: "Channel",
  channel_suggestion: "Channel",
  // content-schema
  series: "Content",
  content_post: "Content",
  content_assignee: "Content",
  content_comment: "Content",
  platform_post: "Content",
  platform_post_link: "Content",
  content_suggestion: "Content",
  // cadence-schema
  cadence_target: "Cadence",
  mix_target: "Cadence",
  // ads-schema
  initiative: "Ads",
  campaign: "Ads",
  ad_spot: "Ads",
  audience: "Ads",
  audience_target: "Ads",
  // amplification-schema
  amplifier: "Amplification",
  amplification_target: "Amplification",
  // listening-schema
  mention: "Listening",
  listening_source: "Listening",
  // lifecycle-schema
  lifecycle_program: "Lifecycle",
  lifecycle_program_step: "Lifecycle",
  lifecycle_campaign: "Lifecycle",
  lifecycle_touchpoint: "Lifecycle",
  // media-schema
  media_asset: "Media",
  // leads-schema (its own `leads` Postgres schema; bare table names)
  "leads.domain": "Leads",
  "leads.contact": "Leads",
  "leads.import": "Leads",
  // schema.ts barrel
  attachment: "Misc",
};

const DOMAIN_ORDER = [
  "Brand",
  "Channel",
  "Content",
  "Cadence",
  "Ads",
  "Amplification",
  "Listening",
  "Lifecycle",
  "Media",
  "Leads",
  "Auth",
  "Misc",
  "Unmapped",
];

type CatalogRow = {
  schema: string;
  name: string;
  has_created: boolean;
  has_updated: boolean;
  has_seed: boolean;
};

type CountRow = {
  id: string;
  total: number;
  seed: number | null;
  last_write: string | null;
};

// The neon-http driver returns either an array of rows or a { rows } result
// depending on path; normalize both.
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && "rows" in res) {
    return (res as { rows: T[] }).rows;
  }
  return [];
}

export async function getDataHealth(): Promise<DataHealth> {
  // 1. Discover every base table + which capability columns it has, in one go.
  const catalogRes = await db.execute(sql`
    select
      c.table_schema as schema,
      c.table_name as name,
      bool_or(c.column_name = 'created_at') as has_created,
      bool_or(c.column_name = 'updated_at') as has_updated,
      bool_or(c.column_name = 'is_seed') as has_seed
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema in ('public', 'leads')
      and t.table_type = 'BASE TABLE'
      and c.table_name !~ '^__'
    group by c.table_schema, c.table_name
    order by c.table_schema, c.table_name
  `);
  const catalog = rowsOf<CatalogRow>(catalogRes);

  // 2. One dynamic UNION ALL: exact count, seed count, and last-write per table.
  const counts = new Map<string, CountRow>();
  if (catalog.length > 0) {
    const parts = catalog.map((r) => {
      const tbl = `"${r.schema}"."${r.name}"`;
      const id = `${r.schema}.${r.name}`;
      const seedExpr = r.has_seed
        ? `(select count(*)::int from ${tbl} where is_seed)`
        : `null::int`;
      const lastExpr =
        r.has_created && r.has_updated
          ? `(select max(greatest(created_at::timestamptz, updated_at::timestamptz)) from ${tbl})`
          : r.has_created
            ? `(select max(created_at::timestamptz) from ${tbl})`
            : r.has_updated
              ? `(select max(updated_at::timestamptz) from ${tbl})`
              : `null::timestamptz`;
      return `select '${id}' as id, (select count(*)::int from ${tbl}) as total, ${seedExpr} as seed, ${lastExpr} as last_write`;
    });
    const countRes = await db.execute(sql.raw(parts.join("\nunion all\n")));
    for (const row of rowsOf<CountRow>(countRes)) counts.set(row.id, row);
  }

  // 3. Assemble per-table stats.
  const stats: TableStat[] = catalog.map((r) => {
    const c = counts.get(`${r.schema}.${r.name}`);
    const total = c?.total ?? 0;
    const seed = c?.seed ?? 0;
    const real = Math.max(0, total - seed);
    const status: TableStatus =
      total === 0 ? "empty" : real === 0 ? "seed_only" : "live";
    return {
      schema: r.schema,
      name: r.name,
      // Prefer a schema-qualified key (leads.* tables use generic bare names).
      domain:
        DOMAIN_BY_TABLE[`${r.schema}.${r.name}`] ??
        DOMAIN_BY_TABLE[r.name] ??
        "Unmapped",
      total,
      seed,
      real,
      lastWrite: c?.last_write ? new Date(c.last_write) : null,
      status,
    };
  });

  // 4. Group by domain, in display order (unknown domains tacked on the end).
  const byDomain = new Map<string, TableStat[]>();
  for (const s of stats) {
    const arr = byDomain.get(s.domain) ?? [];
    arr.push(s);
    byDomain.set(s.domain, arr);
  }
  const orderedDomains = [
    ...DOMAIN_ORDER.filter((d) => byDomain.has(d)),
    ...[...byDomain.keys()].filter((d) => !DOMAIN_ORDER.includes(d)),
  ];
  const groups: DomainGroup[] = orderedDomains.map((domain) => {
    const tables = (byDomain.get(domain) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      domain,
      tables,
      tableCount: tables.length,
      populated: tables.filter((t) => t.status === "live").length,
      totalRows: tables.reduce((n, t) => n + t.total, 0),
    };
  });

  return {
    groups,
    scannedAt: new Date(),
    totalTables: stats.length,
    totalRows: stats.reduce((n, t) => n + t.total, 0),
    emptyTables: stats
      .filter((t) => t.status !== "live")
      .sort(
        (a, b) =>
          a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name),
      ),
  };
}
