/**
 * Local test runner for the CIO property recs pipeline.
 *
 * Usage:
 *   bun scripts/test-recs-pipeline.ts                          # full dry run, all users
 *   bun scripts/test-recs-pipeline.ts --limit=50               # dry run, 50 users
 *   bun scripts/test-recs-pipeline.ts --emails=a@b.com,c@d.com # specific users (dry run)
 *   bun scripts/test-recs-pipeline.ts --phase=fetch            # just test BQ connectivity
 *   bun scripts/test-recs-pipeline.ts --phase=embed --limit=3  # embed 3 properties
 *   bun scripts/test-recs-pipeline.ts --phase=rank --emails=a@b.com
 *   bun scripts/test-recs-pipeline.ts --live --limit=10        # actually sync 10 users
 */

import {
  fetchBookableProperties,
  fetchUserBehaviorSignals,
  fetchUserSearchHistory,
  buildUserProfiles,
  buildPropertyIndex,
  generateAllRecs,
  run,
} from "@/server/pipelines/cio-property-recs/cio-property-recs.pipeline";
import { generatePropertyEmbeddings } from "@/server/pipelines/cio-property-recs/embed";

// ── Arg Parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const eq = a.indexOf("=");
      return eq === -1 ? [a.slice(2), "true"] : [a.slice(2, eq), a.slice(eq + 1)];
    }),
);

const phase = (flags.phase as string) ?? "full";
const dryRun = flags.live !== "true"; // default is dry run — pass --live to actually write
const limit = flags.limit ? parseInt(flags.limit as string, 10) : undefined;
const emails = flags.emails ? (flags.emails as string).split(",").map((e) => e.trim()) : undefined;

// ── Helpers ───────────────────────────────────────────────────────────────────

function separator(label?: string) {
  const line = "─".repeat(60);
  console.log(label ? `\n${line}\n  ${label}\n${line}` : `\n${line}`);
}

function sampleRows<T>(rows: T[], n = 3): T[] {
  return rows.slice(0, n);
}

// ── Phase Runners ─────────────────────────────────────────────────────────────

async function runFetchPhase() {
  separator("Phase: fetch");

  console.log("Fetching bookable properties...");
  const properties = await fetchBookableProperties();
  console.log(`✓ ${properties.length} properties`);
  console.log("\nSample properties:");
  for (const p of sampleRows(properties)) {
    console.log(
      `  ${p.property_name} — ${p.city}, ${p.state} — $${p.base_price}/night — ${p.landscape_category}`,
    );
  }

  console.log("\nFetching user behavior signals...");
  const signals = await fetchUserBehaviorSignals(undefined);
  console.log(`✓ ${signals.length.toLocaleString()} signal rows`);
  console.log("\nSample signals:");
  for (const s of sampleRows(signals)) {
    console.log(
      `  user=${s.id_user} | ${s.property_name} | views=${s.view_count} abandons=${s.abandon_count} bookings=${s.book_count}`,
    );
  }

  console.log("\nFetching user search history...");
  const searches = await fetchUserSearchHistory(undefined);
  console.log(`✓ ${searches.length.toLocaleString()} search rows`);
  console.log("\nSample searches:");
  for (const s of sampleRows(searches)) {
    console.log(`  user=${s.id_user} | ${s.search_location_city}, ${s.search_location_state} (${s.search_count}x)`);
  }

  const profiles = buildUserProfiles(signals, searches);
  console.log(`\n✓ ${profiles.size.toLocaleString()} user profiles built`);
}

async function runEmbedPhase() {
  separator("Phase: embed");

  console.log("Fetching properties...");
  const all = await fetchBookableProperties();
  const sample = limit ? all.slice(0, limit) : all.slice(0, 3);
  console.log(`Embedding ${sample.length} properties (pass --limit=N to change)...`);

  const embeddings = await generatePropertyEmbeddings(sample);

  console.log(`\n✓ ${Object.keys(embeddings).length} embeddings generated`);
  console.log("\nSample embedding (first 8 dims):");
  for (const [name, emb] of Object.entries(embeddings).slice(0, 3)) {
    const preview = emb.embedding.slice(0, 8).map((v) => v.toFixed(4)).join(", ");
    console.log(`  ${name}: [${preview}, ...]`);
  }
}

async function runRankPhase() {
  separator("Phase: rank");

  if (!emails?.length) {
    console.error("--emails=... required for rank phase");
    console.error("Example: bun scripts/test-recs-pipeline.ts --phase=rank --emails=you@wander.com");
    process.exit(1);
  }

  console.log(`Testing recs for: ${emails.join(", ")}`);

  console.log("\nFetching properties + generating embeddings...");
  const properties = await fetchBookableProperties();
  const propertyEmbeddings = await generatePropertyEmbeddings(properties);

  console.log("\nFetching signals for test users...");
  const { executeQuery } = await import("@/server/clients/bigquery.client");
  const userRows = await executeQuery<{ id_user: string; email: string }>(
    `
    SELECT id_user, email
    FROM \`wander-9fc9c.analytics.customer_profiles\`
    WHERE LOWER(email) IN UNNEST(@emails) AND id_user IS NOT NULL
    `,
    { emails: emails.map((e) => e.toLowerCase()) },
    { emails: ["STRING"] },
  );

  if (!userRows.length) {
    console.warn("No matching users found in BigQuery for those emails.");
    return;
  }

  const userIds = userRows.map((r) => r.id_user);
  const emailByUserId = Object.fromEntries(userRows.map((r) => [r.id_user, r.email]));

  const [signals, searches] = await Promise.all([
    fetchUserBehaviorSignals(userIds),
    fetchUserSearchHistory(userIds),
  ]);

  const allProfiles = buildUserProfiles(signals, searches);
  // Safety net: ensure only test users are ranked even if BQ filter leaks
  const profiles = new Map([...allProfiles].filter(([uid]) => userIds.includes(uid)));
  console.log(`  ${profiles.size} profiles after filter (expected ${userIds.length})`);
  const index = buildPropertyIndex(profiles);
  const { recs, coldStart } = generateAllRecs(profiles, propertyEmbeddings, index);

  separator("Results");
  console.log(`${coldStart} cold start users\n`);

  for (const [uid, userRecs] of recs) {
    const email = emailByUserId[uid] ?? uid;
    const profile = profiles.get(uid);
    const isCold = coldStart > 0 && userRecs === recs.get(uid);

    console.log(`\n👤 ${email} (${uid})${isCold ? " [COLD START]" : ""}`);

    if (profile && Object.keys(profile.properties).length > 0) {
      const topInteractions = Object.entries(profile.properties)
        .sort(([, a], [, b]) => b.view_count + b.abandon_count * 4 + b.book_count * 5 - (a.view_count + a.abandon_count * 4 + a.book_count * 5))
        .slice(0, 3);
      console.log("  Top interactions:");
      for (const [name, s] of topInteractions) {
        console.log(`    - ${name}: ${s.view_count}v ${s.abandon_count}a ${s.book_count}b`);
      }
    }

    console.log("  Recommendations:");
    for (let i = 0; i < userRecs.length; i++) {
      const rec = userRecs[i]!;
      console.log(
        `    ${i + 1}. ${rec.propertyName} (${rec.city}, ${rec.state}) — score=${rec.score} — $${rec.basePrice}/night — ${rec.landscape}`,
      );
    }
  }
}

async function runFull() {
  separator(`Full pipeline — ${dryRun ? "DRY RUN" : "LIVE"}`);

  if (!dryRun) {
    console.warn("⚠️  LIVE MODE — will write to Customer.io");
    if (!limit) {
      console.warn("⚠️  No --limit set — this will sync ALL users");
    }
    await new Promise((r) => setTimeout(r, 2000)); // 2s pause to reconsider
  }

  const result = await run({
    dryRun,
    limit,
    testEmails: emails,
  });

  separator("Summary");
  console.log(`  Properties:  ${result.properties}`);
  console.log(`  Users:       ${result.users.toLocaleString()}`);
  console.log(`  Cold start:  ${result.coldStart.toLocaleString()}`);
  console.log(`  Synced:      ${result.synced.toLocaleString()}`);
  console.log(`  Failed:      ${result.failed}`);
  console.log(`  Elapsed:     ${(result.elapsedMs / 1000).toFixed(1)}s`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRecs pipeline test — phase=${phase} dryRun=${dryRun} limit=${limit ?? "none"} emails=${emails?.join(",") ?? "all"}\n`);

  switch (phase) {
    case "fetch":
      await runFetchPhase();
      break;
    case "embed":
      await runEmbedPhase();
      break;
    case "rank":
      await runRankPhase();
      break;
    case "full":
      await runFull();
      break;
    default:
      console.error(`Unknown phase: ${phase}. Use fetch | embed | rank | full`);
      process.exit(1);
  }

  console.log("\n✓ Done\n");
}

main().catch((err) => {
  console.error("\n✗ Failed:", err);
  process.exit(1);
});
