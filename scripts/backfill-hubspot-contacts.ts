/**
 * Walk the entire HubSpot contact universe into `leads.contact`.
 *
 * The target-list import only ever hydrated the pregen cohorts, so Growth holds
 * a few thousand contacts against HubSpot's ~307k. This is the one-off that
 * closes that gap; the webhook rail keeps it closed afterwards.
 *
 * Cursor-paged rather than search-paged because CRM search caps at 10k results
 * per query, which cannot walk 300k+ records. Idempotent on the
 * `(domain, email)` unique index, so re-running a page only refreshes values —
 * which is what makes `--after` safe to point at a slightly stale cursor.
 *
 *   bun --conditions=react-server scripts/backfill-hubspot-contacts.ts --dry
 *   bun --conditions=react-server scripts/backfill-hubspot-contacts.ts
 *   bun --conditions=react-server scripts/backfill-hubspot-contacts.ts --after=<cursor>
 *   bun --conditions=react-server scripts/backfill-hubspot-contacts.ts --max-pages=10
 *
 * Contacts whose company resolves to no `leads.domain` row are counted and
 * skipped, never invented: `leads.domain` is the company projection's business
 * and minting domain rows out of contact email hosts would pollute it.
 */
import { listContactsPage } from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadImportTable } from "@/server/db/leads-schema";
import {
  emptyMirrorStats,
  mirrorContacts,
} from "@/server/services/hubspot-contact-mirror";

const dry = process.argv.includes("--dry");

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const startAfter = argValue("after");
const maxPagesRaw = argValue("max-pages");
const maxPages = maxPagesRaw ? Number(maxPagesRaw) : Infinity;
if (Number.isNaN(maxPages) || maxPages <= 0) {
  throw new Error(`--max-pages must be a positive number, got ${maxPagesRaw}`);
}

const PAGE_SIZE = 100; // HubSpot's ceiling for contacts.basicApi.getPage
const PROGRESS_EVERY = 25;

/**
 * Retry only here, not on the shared client. Enabling the SDK's retry decorator
 * globally would make the webhook receiver sit and wait on a 429 instead of
 * failing fast and letting the hourly cron rail replay it.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status =
        typeof error === "object" && error !== null
          ? Number(
              (error as { statusCode?: unknown; code?: unknown }).statusCode ??
                (error as { code?: unknown }).code ??
                0,
            )
          : 0;
      const retriable = status === 429 || (status >= 500 && status < 600);
      if (!retriable || attempt >= maxAttempts) throw error;
      // HubSpot's rolling window is ten seconds wide; anything shorter on a 429
      // just burns another attempt against the same window.
      const waitMs = status === 429 ? 10_000 : 500 * attempt;
      console.warn(
        `⚠️  ${label} failed with ${status}; attempt ${attempt}/${maxAttempts}, waiting ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

const totals = emptyMirrorStats();
let seen = 0;
let pages = 0;
let after: string | null = startAfter ?? null;
let lastCursor: string | null = startAfter ?? null;
const startedAt = Date.now();

console.log(
  JSON.stringify({
    mode: dry ? "dry" : "apply",
    startAfter: startAfter ?? null,
    maxPages: Number.isFinite(maxPages) ? maxPages : null,
  }),
);

try {
  while (pages < maxPages) {
    const page = await withRetry(`listContactsPage(after=${after})`, () =>
      listContactsPage({ after: after ?? undefined, limit: PAGE_SIZE }),
    );

    seen += page.contacts.length;
    pages += 1;

    if (dry) {
      for (const contact of page.contacts) {
        if (contact.values.email?.trim()) totals.mirrored += 1;
        else totals.noEmail += 1;
      }
    } else {
      const stats = await mirrorContacts(page.contacts);
      totals.mirrored += stats.mirrored;
      totals.noEmail += stats.noEmail;
      totals.unresolvedDomain += stats.unresolvedDomain;
    }

    if (page.after) lastCursor = page.after;

    if (pages % PROGRESS_EVERY === 0) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        JSON.stringify({
          pages,
          seen,
          ...totals,
          elapsedSec,
          contactsPerSec: Math.round(seen / Math.max(elapsedSec, 1)),
          // Printed so an interrupted run can resume without replaying.
          resumeAfter: lastCursor,
        }),
      );
    }

    after = page.after;
    if (!after) break;
  }
} catch (error) {
  console.error(
    JSON.stringify({
      failedAfterPages: pages,
      seen,
      ...totals,
      resumeAfter: lastCursor,
    }),
  );
  throw error;
}

const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
const exhausted = after === null;

if (!dry) {
  await db.insert(leadImportTable).values({
    filename: "hubspot-contact-backfill",
    source: "hubspot",
    rowCount: seen,
    // The mirror upserts, so created-vs-updated is not distinguishable without
    // a second read. Record the projected total and keep the skips in notes.
    contactsUpdated: totals.mirrored,
    notes: JSON.stringify({
      pages,
      startAfter: startAfter ?? null,
      resumeAfter: exhausted ? null : lastCursor,
      exhausted,
      skippedNoEmail: totals.noEmail,
      skippedUnresolvedDomain: totals.unresolvedDomain,
      elapsedSec,
    }),
  });
}

console.log(
  JSON.stringify(
    {
      mode: dry ? "dry" : "apply",
      pages,
      contactsSeen: seen,
      mirrored: totals.mirrored,
      skippedNoEmail: totals.noEmail,
      skippedUnresolvedDomain: totals.unresolvedDomain,
      elapsedSec,
      exhausted,
      resumeAfter: exhausted ? null : lastCursor,
    },
    null,
    2,
  ),
);
