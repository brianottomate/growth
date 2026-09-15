/**
 * import-abandoned-cart.ts — batch Outreach import of abandoned-checkout guests
 * from an Adapt-formatted CSV (generalized from import-checkout-incident.ts).
 *
 * Expects the header layout Adapt produces for its Outreach exports:
 *   First Name, Last Name, Email, Mobile Phone, Tags, Cart Value USD,
 *   Checkout Attempts, Units Viewed, Property, Check In, Nights, Guests,
 *   Last Attempt (ET), Returning Guest, Source
 * Columns are matched by header name, so order doesn't matter.
 *
 * Behavior (same shape as the checkout-incident import):
 *   - skips rows without an email, @wander.com employees, and QA accounts
 *     (wanderqa-*@sharklasers.com, @spurmail.com)
 *   - dedupes by email
 *   - existing prospects: merges tags + refreshes personalNote2, owner untouched
 *   - new prospects: DEMAND_NEW stage, booking-guest persona, BDR round-robin
 *     (load-balanced; guests with a phone only go to calling BDRs)
 *   - throttled (sequential + delay between guests) with one retry on 429,
 *     so a full 150-guest run takes a few minutes and stays far under
 *     Outreach's rate limits
 *
 * Dry-run by default — pass --execute to write to Outreach.
 *
 *   bun run scripts/import-abandoned-cart.ts <csv-path>                    # dry run
 *   bun run scripts/import-abandoned-cart.ts <csv-path> --limit 3 --execute  # smoke test
 *   bun run scripts/import-abandoned-cart.ts <csv-path> --execute          # full run
 *   bun run scripts/import-abandoned-cart.ts <csv-path> --tag "My_Tag"     # override CSV tag
 */
import { readFileSync } from "node:fs";

import {
  createProspect,
  updateProspect,
  searchProspectByEmail,
  isOutreachConfigured,
  OutreachError,
} from "@/server/clients/outreach.client";
import {
  OUTREACH_STAGES,
  PERSONA_BOOKING_GUEST_ID,
} from "@/server/services/outreach/field-mapping";
import {
  getNextBdr,
  getNextBdrFromOutreachLoad,
} from "@/server/services/outreach/bdr-assignment.service";

const BASE_TAG = "Abandoned Payment";
const DELAY_MS = 500;

// ---- args ----------------------------------------------------------

const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const tagFlagIdx = argv.indexOf("--tag");
const tagOverride = tagFlagIdx >= 0 ? argv[tagFlagIdx + 1] : undefined;
const limitFlagIdx = argv.indexOf("--limit");
const limit =
  limitFlagIdx >= 0 ? parseInt(argv[limitFlagIdx + 1] ?? "", 10) : undefined;
const csvPath = argv.find(
  (a, i) =>
    !a.startsWith("--") && argv[i - 1] !== "--tag" && argv[i - 1] !== "--limit",
);

if (!csvPath) {
  throw new Error(
    'usage: bun run scripts/import-abandoned-cart.ts <csv-path> [--tag "Tag"] [--limit N] [--execute]',
  );
}

// ---- RFC-4180 CSV parser (quoted fields, "" escapes, multi-line) ----

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f.trim() !== "")) records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  if (record.some((f) => f.trim() !== "")) records.push(record);
  return records;
}

interface CartRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string;
  cartValue: string;
  attempts: string;
  unitsViewed: string;
  property: string;
  checkIn: string;
  nights: string;
  guests: string;
  lastAttemptEt: string;
  returningGuest: string;
  source: string;
}

function parseRows(csv: string): CartRow[] {
  const records = parseCsv(csv);
  const header = records[0];
  if (!header) throw new Error("empty CSV");
  const col = (name: string) => {
    const idx = header.findIndex(
      (h) => h.trim().toLowerCase() === name.toLowerCase(),
    );
    if (idx === -1)
      throw new Error(`missing expected column "${name}" in CSV header`);
    return idx;
  };
  const idx = {
    firstName: col("First Name"),
    lastName: col("Last Name"),
    email: col("Email"),
    phone: col("Mobile Phone"),
    tags: col("Tags"),
    cartValue: col("Cart Value USD"),
    attempts: col("Checkout Attempts"),
    unitsViewed: col("Units Viewed"),
    property: col("Property"),
    checkIn: col("Check In"),
    nights: col("Nights"),
    guests: col("Guests"),
    lastAttemptEt: col("Last Attempt (ET)"),
    returningGuest: col("Returning Guest"),
    source: col("Source"),
  };
  return records.slice(1).map((f) => ({
    firstName: (f[idx.firstName] ?? "").trim(),
    lastName: (f[idx.lastName] ?? "").trim(),
    email: (f[idx.email] ?? "").trim().toLowerCase(),
    phone: (f[idx.phone] ?? "").trim(),
    tags: (f[idx.tags] ?? "").trim(),
    cartValue: (f[idx.cartValue] ?? "").trim(),
    attempts: (f[idx.attempts] ?? "").trim(),
    unitsViewed: (f[idx.unitsViewed] ?? "").trim(),
    property: (f[idx.property] ?? "").trim(),
    checkIn: (f[idx.checkIn] ?? "").trim(),
    nights: (f[idx.nights] ?? "").trim(),
    guests: (f[idx.guests] ?? "").trim(),
    lastAttemptEt: (f[idx.lastAttemptEt] ?? "").trim(),
    returningGuest: (f[idx.returningGuest] ?? "").trim(),
    source: (f[idx.source] ?? "").trim(),
  }));
}

// ---- filtering -----------------------------------------------------

function skipReason(row: CartRow): string | null {
  if (!row.email || row.email === "n/a") return "no email";
  if (row.email.endsWith("@wander.com")) return "internal employee";
  if (row.email.endsWith("@sharklasers.com")) return "QA account (wanderqa)";
  if (row.email.endsWith("@spurmail.com")) return "QA account (spur test mail)";
  return null;
}

function cleanPhone(phone: string): string | null {
  if (!phone || phone === "N/A") return null;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return cleaned || null;
}

function buildCartNote(row: CartRow): string {
  const cart = row.cartValue
    ? `$${Math.round(parseFloat(row.cartValue)).toLocaleString("en-US")}`
    : "n/a";
  const parts = [
    `cart ${cart}`,
    `${row.attempts || "?"} checkout attempt(s) across ${row.unitsViewed || "?"} unit(s)`,
    `property: ${row.property}`,
    `check-in ${row.checkIn} (${row.nights} nights, ${row.guests} guest(s))`,
    `last attempt ${row.lastAttemptEt} ET`,
    row.returningGuest === "yes" ? "returning guest" : "first-time guest",
    ...(row.source ? [`source: ${row.source}`] : []),
  ];
  return `Abandoned checkout on wander.com (Jul 29 – Aug 1 2026 sweep): ${parts.join(", ")}`;
}

function rowTags(row: CartRow): string[] {
  const csvTags = tagOverride
    ? [tagOverride]
    : row.tags
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean);
  return Array.from(new Set([BASE_TAG, ...csvTags]));
}

// ---- throttling ----------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run an Outreach call; on 429, wait out Retry-After once and retry. */
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OutreachError && error.statusCode === 429) {
      const waitS = error.retryAfter ?? 60;
      console.log(`⏳ rate limited, waiting ${waitS}s before retrying once…`);
      await sleep(waitS * 1000);
      return await fn();
    }
    throw error;
  }
}

// ---- main ----------------------------------------------------------

async function main() {
  const allRows = parseRows(readFileSync(csvPath!, "utf8"));
  console.log(`📄 ${allRows.length} rows in CSV`);

  const skipped: Array<{ row: CartRow; reason: string }> = [];
  const byEmail = new Map<string, CartRow>();
  for (const row of allRows) {
    const reason = skipReason(row);
    if (reason) {
      skipped.push({ row, reason });
      continue;
    }
    if (byEmail.has(row.email)) {
      skipped.push({ row, reason: `duplicate of ${row.email}` });
      continue;
    }
    byEmail.set(row.email, row);
  }

  for (const { row, reason } of skipped) {
    console.log(`⏭️  skip ${row.email || row.property}: ${reason}`);
  }

  let rows = Array.from(byEmail.values());
  if (limit && Number.isFinite(limit)) {
    rows = rows.slice(0, limit);
    console.log(
      `✂️  --limit ${limit}: processing first ${rows.length} guests only`,
    );
  }
  console.log(
    `\n🎯 ${rows.length} distinct guests to sync (${skipped.length} skipped)\n`,
  );

  if (!execute) {
    for (const row of rows) {
      const name =
        [row.firstName, row.lastName].filter(Boolean).join(" ") || "(no name)";
      console.log(
        `DRY RUN — ${name} <${row.email}>${row.phone ? " 📞" : ""} tags=[${rowTags(row).join(", ")}]`,
      );
      console.log(`   note: ${buildCartNote(row).slice(0, 200)}…\n`);
    }
    console.log("Re-run with --execute to write to Outreach.");
    return;
  }

  if (!isOutreachConfigured) {
    throw new Error("Outreach is not configured (env)");
  }

  let created = 0;
  let updated = 0;
  const ownerCounts = new Map<string, number>();

  for (const row of rows) {
    const phone = cleanPhone(row.phone);
    const note = buildCartNote(row);
    const tags = rowTags(row);

    const existing = await withRateLimitRetry(() =>
      searchProspectByEmail(row.email),
    );

    if (existing) {
      const mergedTags = Array.from(
        new Set([...(existing.attributes.tags ?? []), ...tags]),
      );
      const result = await withRateLimitRetry(() =>
        updateProspect(existing.id, {
          attributes: { tags: mergedTags, personalNote2: note },
        }),
      );
      updated++;
      console.log(`✅ updated #${result.id} ${row.email} (owner untouched)`);
    } else {
      const bdr =
        (await getNextBdrFromOutreachLoad(!!phone)) ?? getNextBdr(!!phone);
      const result = await withRateLimitRetry(() =>
        createProspect({
          attributes: {
            firstName: row.firstName || null,
            lastName: row.lastName || null,
            emails: [row.email],
            ...(phone ? { mobilePhones: [phone] } : {}),
            tags,
            personalNote2: note,
          },
          stageId: OUTREACH_STAGES.DEMAND_NEW,
          personaId: PERSONA_BOOKING_GUEST_ID,
          ownerId: bdr ? parseInt(bdr.outreachUserId, 10) : undefined,
        }),
      );
      created++;
      const owner = bdr?.name ?? "unassigned";
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
      console.log(`✅ created #${result.id} ${row.email} → owner ${owner}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\n📊 done: ${created} created, ${updated} updated, ${skipped.length} skipped`,
  );
  if (ownerCounts.size > 0) {
    console.log("👥 new-prospect BDR distribution:");
    for (const [owner, count] of ownerCounts) {
      console.log(`   ${owner}: ${count}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
