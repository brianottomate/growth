/**
 * Re-read every active Meta lead form and finish any lead the webhook missed:
 * a dropped delivery, a failed CAPI send or HubSpot handoff, or a stretch when
 * the app lost its Page Leads Access assignment (Meta then verifies the
 * callback but never POSTs). Each step is claimed once per leadgen id, so a
 * rerun over the same window is safe.
 *
 * Sends real MQL events and HubSpot handoffs, so run it against prod:
 *
 *   doppler run --project wander-growth --config prd -- \
 *     bun --conditions=react-server scripts/backfill-meta-leadgen.ts --hours 24
 *
 * `--hours` defaults to 24 and caps at 168 (Meta's CRM event window).
 */
import { pollRecentLeads } from "@/server/services/meta-leadgen.service";

const flag = process.argv.indexOf("--hours");
const requested = flag > 0 ? Number(process.argv[flag + 1]) : 24;
const hoursBack = Math.min(Math.max(requested || 24, 1), 168);

const summary = await pollRecentLeads({ hoursBack });
console.log({ hoursBack, ...summary });
process.exit(0);
