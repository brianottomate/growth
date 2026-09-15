/**
 * import-checkout-incident.ts — one-off Outreach import of the Jul 13–16 2026
 * wander.com checkout Stripe incident victims (Sentry: confirmPayment
 * capture_method mismatch + Payment Element not mounted).
 *
 * Reads the incident CSV (guest PII — keep local), keeps only real, contactable
 * bug victims, and upserts them into the demand pipeline:
 *   - skips rows without warehouse contact info (never persisted)
 *   - skips @wander.com addresses (employees reproducing the bug)
 *   - skips CONFIRMED bookings (guest eventually got through)
 *   - dedupes by email, aggregating every affected booking into one note
 *
 * Prospects get the standard demand shape (DEMAND_NEW stage, booking-guest
 * persona, BDR round-robin owner) plus tags "Abandoned Payment" and
 * "Checkout Incident 2026-07", with the per-booking context in personalNote2.
 *
 * Dry-run by default — pass --execute to write to Outreach.
 *
 *   bun run scripts/import-checkout-incident.ts <csv-path> [--execute]
 */
import { readFileSync } from "node:fs";

import {
  createProspect,
  updateProspect,
  searchProspectByEmail,
  isOutreachConfigured,
} from "@/server/clients/outreach.client";
import {
  OUTREACH_STAGES,
  PERSONA_BOOKING_GUEST_ID,
} from "@/server/services/outreach/field-mapping";
import {
  getNextBdr,
  getNextBdrFromOutreachLoad,
} from "@/server/services/outreach/bdr-assignment.service";

const INCIDENT_TAG = "Checkout Incident 2026-07";

const [csvPath, ...flags] = process.argv.slice(2);
const execute = flags.includes("--execute");

if (!csvPath) {
  throw new Error(
    "usage: bun run scripts/import-checkout-incident.ts <csv-path> [--execute]",
  );
}
const inputPath: string = csvPath;

interface IncidentRow {
  bookingId: string;
  bookingStatus: string;
  propertyName: string;
  propertyUrl: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  failureReason: string;
  attempts: string;
  lastErrorUtc: string;
  guestLocation: string;
}

/** Minimal CSV parser that honors quoted fields (property names contain commas). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseRows(csv: string): IncidentRow[] {
  const lines = csv.trim().split("\n");
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      bookingId: f[0] ?? "",
      bookingStatus: f[1] ?? "",
      propertyName: f[2] ?? "",
      propertyUrl: f[3] ?? "",
      checkIn: f[4] ?? "",
      checkOut: f[5] ?? "",
      guestName: f[6] ?? "",
      guestEmail: (f[7] ?? "").toLowerCase(),
      guestPhone: f[8] ?? "",
      failureReason: f[9] ?? "",
      attempts: f[10] ?? "",
      lastErrorUtc: f[12] ?? "",
      guestLocation: f[13] ?? "",
    };
  });
}

function skipReason(row: IncidentRow): string | null {
  if (!row.guestEmail || row.guestEmail === "n/a")
    return "no contact (not persisted)";
  if (row.guestEmail.endsWith("@wander.com")) return "internal employee";
  if (row.bookingStatus === "CONFIRMED") return "booking confirmed anyway";
  return null;
}

function buildIncidentNote(rows: IncidentRow[]): string {
  const bookings = rows
    .map(
      (row) =>
        `${row.propertyName} (${row.checkIn} → ${row.checkOut}) — ${row.failureReason}, ` +
        `${row.attempts} attempt(s), last ${row.lastErrorUtc} — ${row.propertyUrl}`,
    )
    .join("  ||  ");
  return (
    `Checkout bug victim (Stripe capture_method incident, Jul 13–16 2026): clicked ` +
    `"Confirm and pay" while checkout was broken. Affected booking(s): ${bookings}`
  );
}

function cleanPhone(phone: string): string | null {
  if (!phone || phone === "N/A") return null;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return cleaned || null;
}

async function main() {
  const rows = parseRows(readFileSync(inputPath, "utf8"));
  console.log(`📄 ${rows.length} rows in CSV`);

  const skipped: Array<{ row: IncidentRow; reason: string }> = [];
  const byEmail = new Map<string, IncidentRow[]>();
  for (const row of rows) {
    const reason = skipReason(row);
    if (reason) {
      skipped.push({ row, reason });
      continue;
    }
    byEmail.set(row.guestEmail, [...(byEmail.get(row.guestEmail) ?? []), row]);
  }

  for (const { row, reason } of skipped) {
    console.log(
      `⏭️  skip ${row.bookingId} (${row.guestEmail || row.propertyName}): ${reason}`,
    );
  }
  console.log(`\n🎯 ${byEmail.size} distinct guests to sync\n`);

  if (!execute) {
    for (const [email, guestRows] of byEmail) {
      console.log(
        `DRY RUN — ${guestRows[0]!.guestName} <${email}> (${guestRows.length} booking(s))`,
      );
      console.log(`   note: ${buildIncidentNote(guestRows).slice(0, 220)}…\n`);
    }
    console.log("Re-run with --execute to write to Outreach.");
    return;
  }

  if (!isOutreachConfigured) {
    throw new Error("Outreach is not configured (env)");
  }

  for (const [email, guestRows] of byEmail) {
    const first = guestRows[0]!;
    // Warehouse returns literal "N/A" for unnamed guests (Apple relay signups)
    const guestName = first.guestName === "N/A" ? "" : first.guestName.trim();
    const [firstName, ...restName] = guestName.split(" ").filter(Boolean);
    const phone = cleanPhone(first.guestPhone);
    const [city, country] = first.guestLocation.split(",").map((s) => s.trim());
    const note = buildIncidentNote(guestRows);

    const existing = await searchProspectByEmail(email);

    if (existing) {
      const tags = Array.from(
        new Set([
          ...(existing.attributes.tags ?? []),
          "Abandoned Payment",
          INCIDENT_TAG,
        ]),
      );
      const updated = await updateProspect(existing.id, {
        attributes: { tags, personalNote2: note },
      });
      console.log(`✅ updated #${updated.id} ${email} (owner untouched)`);
      continue;
    }

    const bdr =
      (await getNextBdrFromOutreachLoad(!!phone)) ?? getNextBdr(!!phone);
    const created = await createProspect({
      attributes: {
        firstName: firstName ?? null,
        lastName: restName.join(" ") || null,
        emails: [email],
        ...(phone ? { mobilePhones: [phone] } : {}),
        addressCity: city ?? null,
        addressCountry: country ?? null,
        tags: ["Abandoned Payment", INCIDENT_TAG],
        personalNote2: note,
      },
      stageId: OUTREACH_STAGES.DEMAND_NEW,
      personaId: PERSONA_BOOKING_GUEST_ID,
      ownerId: bdr ? parseInt(bdr.outreachUserId, 10) : undefined,
    });
    console.log(
      `✅ created #${created.id} ${email} → owner ${bdr?.name ?? "unassigned"}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
