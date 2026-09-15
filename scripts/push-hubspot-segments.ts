/**
 * Push growth segments to HubSpot as MANUAL company lists — the first
 * "good segmentation in HubSpot" pass, built from the link-pass ground truth
 * (docs/hubspot-gateway-plan.md). Rerunnable: finds each list by name (creates
 * if missing) and adds memberships (adding an existing member is a no-op).
 *
 *   bun run --conditions=react-server scripts/push-hubspot-segments.ts [--dry]
 *
 * Segments (companies, by our Neon enrichment × live HubSpot lead status):
 *   1. Untouched small PMs — never worked (NEW / Research Needed), 5–49 units
 *      (estimate or raw), integrated PMS, not outreach-excluded.
 *   2. Re-engage candidates — previously touched, went quiet
 *      (No Response / Follow Up Later), not outreach-excluded.
 */
import { sql } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";

const TOKEN = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED not set");
const DRY = process.argv.includes("--dry");
const COMPANY_OBJECT_TYPE_ID = "0-2";

async function hs<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`HubSpot ${path} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const SEGMENTS: Array<{ name: string; query: ReturnType<typeof sql> }> = [
  {
    name: "Growth · Untouched small PMs (5–49 units, integrated PMS)",
    query: sql`
      SELECT hubspot_record_id FROM leads.domain
      WHERE hubspot_record_id IS NOT NULL AND deleted_at IS NULL
        AND hubspot_lead_status IN ('NEW', 'New Lead - Research Needed')
        AND exclude_from_outreach = false
        AND is_integrated_pms = true
        AND COALESCE(unit_estimate, unit_count) BETWEEN 5 AND 49`,
  },
  {
    name: "Growth · Re-engage candidates (touched, went quiet)",
    query: sql`
      SELECT hubspot_record_id FROM leads.domain
      WHERE hubspot_record_id IS NOT NULL AND deleted_at IS NULL
        AND hubspot_lead_status IN ('No Response', 'Follow Up Later')
        AND exclude_from_outreach = false`,
  },
];

async function findListByName(name: string): Promise<string | null> {
  const res = await hs<{ lists?: Array<{ listId: string; name: string }> }>(
    `/crm/v3/lists/search`,
    {
      method: "POST",
      body: JSON.stringify({
        query: name,
        processingTypes: ["MANUAL"],
        count: 10,
      }),
    },
  );
  return res.lists?.find((l) => l.name === name)?.listId ?? null;
}

async function main() {
  for (const seg of SEGMENTS) {
    const rows = await db.execute(seg.query);
    const ids = rows.rows
      .map((r) =>
        String((r as { hubspot_record_id: string }).hubspot_record_id),
      )
      .filter(Boolean);
    console.log(`\n▸ ${seg.name}: ${ids.length} companies`);
    if (DRY) continue;

    let listId = await findListByName(seg.name);
    if (listId) {
      console.log(`  list exists (${listId}) — adding memberships`);
    } else {
      const created = await hs<{ list: { listId: string } }>(`/crm/v3/lists/`, {
        method: "POST",
        body: JSON.stringify({
          name: seg.name,
          objectTypeId: COMPANY_OBJECT_TYPE_ID,
          processingType: "MANUAL",
        }),
      });
      listId = created.list.listId;
      console.log(`  created list ${listId}`);
    }

    for (let i = 0; i < ids.length; i += 250) {
      const chunk = ids.slice(i, i + 250);
      await hs(`/crm/v3/lists/${listId}/memberships/add`, {
        method: "PUT",
        body: JSON.stringify(chunk),
      });
      await sleep(150);
    }
    console.log(
      `  ✓ ${ids.length} memberships → https://app.hubspot.com/contacts/22480390/objectLists/${listId}`,
    );
  }
  console.log("\n🔁 Segment push complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Segment push failed:", err);
  process.exit(1);
});
