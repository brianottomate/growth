/**
 * import-ota-guests.ts — batch Outreach import of past OTA bookers.
 *
 * Takes the warehouse export of guests who stayed in a wander.com home via an
 * OTA (Airbnb / Vrbo / Booking.com) rather than direct or manual, and upserts
 * them into the demand pipeline tagged for a re-engagement campaign
 * (default tag: "OTA_Guest_8/26").
 *
 * Behaviour:
 *   - parses the CSV by header name, skips no-contact / @wander.com /
 *     placeholder rows, dedupes by email (see ota-guest-import.service.ts)
 *   - holds back guests whose stay has not happened yet (--include-upcoming to
 *     override): a future check-in means a live OTA booking, and pitching a
 *     direct rebook there is off-platform diversion of a reservation the OTA
 *     has not been paid for
 *   - existing prospect  -> union tags only; owner, stage and existing notes
 *     are left alone (writes personalNote2 only when it is blank)
 *   - new prospect       -> DEMAND_NEW stage (or --stage=booked), booking-guest
 *     persona, BDR round-robin owner, tags + note + booking custom fields
 *   - throttled, retries 429/5xx with backoff, and appends every processed
 *     email to a resume ledger so an interrupted run can be re-run safely
 *
 * Dry-run by default — pass --execute to write to Outreach.
 *
 *   bun run scripts/import-ota-guests.ts <csv-path>
 *   bun run scripts/import-ota-guests.ts <csv-path> --limit 25 --execute
 *   bun run scripts/import-ota-guests.ts <csv-path> --tag "OTA_Guest_8/26" --execute
 *
 * Existing prospects who have opted out of email are tagged-skipped unless
 * --include-opted-out is passed.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  createProspect,
  updateProspect,
  searchProspectByEmail,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";
import {
  OUTREACH_STAGES,
  PERSONA_BOOKING_GUEST_ID,
} from "@/server/services/outreach/field-mapping";
import { getNextBdr } from "@/server/services/outreach/bdr-assignment.service";
import {
  buildCustomFields,
  buildNote,
  buildTags,
  dedupeByEmail,
  hasUpcomingStay,
  parseOtaGuestCsv,
  splitName,
  type OtaGuest,
} from "@/server/services/outreach/ota-guest-import.service";

const DEFAULT_TAG = "OTA_Guest_8/26";
const MAX_ATTEMPTS = 5;

const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith("--"));

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const positional = args.indexOf(`--${name}`);
  if (
    positional !== -1 &&
    args[positional + 1] &&
    !args[positional + 1]!.startsWith("--")
  ) {
    return args[positional + 1]!;
  }
  return fallback;
}

if (!csvPath) {
  throw new Error(
    "usage: bun run scripts/import-ota-guests.ts <csv-path> [--execute] [--tag <tag>] " +
      "[--limit <n>] [--stage new|booked] [--channel-tags] [--no-assign] [--include-opted-out] " +
      "[--include-upcoming] [--rps <n>] [--state <path>]",
  );
}

const execute = flag("execute");
const channelTags = flag("channel-tags");
const assignBdr = !flag("no-assign");
const includeOptedOut = flag("include-opted-out");
// Guests whose stay hasn't happened yet are held back by default (Serrelle,
// 2026-08-05: "lets exclude that list and just tag the ones who have OTA stays
// that have already happened").
const includeUpcoming = flag("include-upcoming");
const campaignTag = option("tag", DEFAULT_TAG);
const limit = Number.parseInt(option("limit", "0"), 10) || 0;
const requestsPerSecond = Number.parseFloat(option("rps", "4")) || 4;
const statePath = option("state", `${csvPath}.imported.jsonl`);
const stage =
  option("stage", "new") === "booked"
    ? OUTREACH_STAGES.DEMAND_BOOKED
    : OUTREACH_STAGES.DEMAND_NEW;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Outreach rate-limits per hour; back off on 429 and transient 5xx. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = isOutreachError(error) ? error.statusCode : undefined;
      const retryable =
        status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const retryAfter = isOutreachError(error) ? error.retryAfter : undefined;
      const waitMs = retryAfter
        ? retryAfter * 1000
        : Math.min(60_000, 2 ** attempt * 1000);
      console.warn(
        `⏳ ${label}: ${status} — retrying in ${Math.round(waitMs / 1000)}s`,
      );
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function loadLedger(): Set<string> {
  if (!existsSync(statePath)) return new Set();
  const done = new Set<string>();
  for (const line of readFileSync(statePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { email?: string };
      if (entry.email) done.add(entry.email);
    } catch {
      // A truncated final line just means that guest gets retried.
    }
  }
  return done;
}

function recordDone(
  email: string,
  action: string,
  prospectId?: string | number,
) {
  appendFileSync(
    statePath,
    `${JSON.stringify({ email, action, prospectId, at: new Date().toISOString() })}\n`,
  );
}

/** Outreach reports opt-out as e.g. "opted_out"; never add those to a campaign. */
function isOptedOut(status: string | null | undefined): boolean {
  return /out/i.test(status ?? "");
}

async function syncGuest(guest: OtaGuest): Promise<string> {
  const existing = await withRetry(`search ${guest.email}`, () =>
    searchProspectByEmail(guest.email),
  );

  if (existing) {
    if (!includeOptedOut && isOptedOut(existing.attributes.emailsOptStatus)) {
      recordDone(guest.email, "skipped-opted-out", existing.id);
      return `skipped #${existing.id} (email opted out)`;
    }
    const tags = buildTags(guest, campaignTag, {
      existingTags: existing.attributes.tags ?? [],
      channelTags,
    });
    const attributes: Record<string, unknown> = { tags };
    // Never clobber a BDR's own note; only fill it when empty.
    if (!existing.attributes.personalNote2) {
      attributes.personalNote2 = buildNote(guest);
    }
    const updated = await withRetry(`update ${guest.email}`, () =>
      updateProspect(existing.id, { attributes }),
    );
    recordDone(guest.email, "updated", updated.id);
    return `updated #${updated.id}`;
  }

  const { firstName, lastName } = splitName(guest.name);
  // Static round robin, not getNextBdrFromOutreachLoad: see the note on
  // assignBdr in main(). Zero API calls and an actually even split.
  const bdr = assignBdr ? getNextBdr(!!guest.phone) : null;

  const created = await withRetry(`create ${guest.email}`, () =>
    createProspect({
      attributes: {
        firstName,
        lastName,
        emails: [guest.email],
        ...(guest.phone ? { mobilePhones: [guest.phone] } : {}),
        tags: buildTags(guest, campaignTag, { channelTags }),
        personalNote2: buildNote(guest),
        ...buildCustomFields(guest, campaignTag),
      },
      stageId: stage,
      personaId: PERSONA_BOOKING_GUEST_ID,
      ownerId: bdr ? parseInt(bdr.outreachUserId, 10) : undefined,
    }),
  );
  recordDone(guest.email, "created", created.id);
  return `created #${created.id} → owner ${bdr?.name ?? "unassigned"}`;
}

async function main() {
  const rows = parseOtaGuestCsv(readFileSync(csvPath!, "utf8"));
  const { guests: allGuests, skipped } = dedupeByEmail(rows);

  const skipCounts = new Map<string, number>();
  for (const { reason } of skipped) {
    skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1);
  }

  // A stay that hasn't happened yet is a live OTA booking, not a past one.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allGuests.filter((guest) => hasUpcomingStay(guest, today));
  const guests = includeUpcoming
    ? allGuests
    : allGuests.filter((guest) => !hasUpcomingStay(guest, today));

  console.log(`📄 ${rows.length} rows in CSV`);
  for (const [reason, count] of skipCounts)
    console.log(`⏭️  ${count} skipped — ${reason}`);
  if (upcoming.length > 0) {
    console.log(
      includeUpcoming
        ? `⚠️  ${upcoming.length} guests with an UPCOMING stay INCLUDED (--include-upcoming)`
        : `⏭️  ${upcoming.length} skipped — stay still upcoming (live OTA booking)`,
    );
  }
  console.log(`🎯 ${guests.length} distinct guests`);
  console.log(
    `🏷️  tag: ${campaignTag}${channelTags ? " (+ per-channel tags)" : ""}`,
  );

  const alreadyDone = loadLedger();
  let queue = guests.filter((guest) => !alreadyDone.has(guest.email));
  if (alreadyDone.size > 0) {
    console.log(
      `↩️  ${alreadyDone.size} already processed in a previous run (${statePath})`,
    );
  }
  if (limit > 0) queue = queue.slice(0, limit);
  console.log(`📬 ${queue.length} to sync this run\n`);

  if (!execute) {
    for (const guest of queue.slice(0, 10)) {
      console.log(
        `DRY RUN — ${guest.name || "(no name)"} <${guest.email}> ${guest.phone ?? ""}`,
      );
      console.log(
        `   tags: ${buildTags(guest, campaignTag, { channelTags }).join(", ")}`,
      );
      console.log(`   note: ${buildNote(guest).slice(0, 200)}…\n`);
    }
    if (queue.length > 10) console.log(`… and ${queue.length - 10} more`);
    console.log("\nRe-run with --execute to write to Outreach.");
    return;
  }

  if (!isOutreachConfigured)
    throw new Error("Outreach is not configured (env)");

  const failures: Array<{ email: string; error: string }> = [];
  let processed = 0;
  const throttleMs = Math.ceil(1000 / requestsPerSecond);

  for (const guest of queue) {
    try {
      const result = await syncGuest(guest);
      console.log(
        `${result.startsWith("skipped") ? "⏭️ " : "✅"} ${guest.email} — ${result}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ email: guest.email, error: message });
      console.error(`❌ ${guest.email} — ${message}`);
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`… ${processed}/${queue.length} (${failures.length} failed)`);
    }
    await sleep(throttleMs);
  }

  console.log(
    `\n🏁 done — ${processed - failures.length} synced, ${failures.length} failed, ledger: ${statePath}`,
  );
  if (failures.length > 0) {
    const failurePath = `${csvPath}.failures.csv`;
    writeFileSync(
      failurePath,
      `email,error\n${failures.map((f) => `${f.email},"${f.error.replace(/"/g, "'")}"`).join("\n")}\n`,
    );
    console.log(
      `⚠️  failures written to ${failurePath} — re-run the script to retry just those`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
