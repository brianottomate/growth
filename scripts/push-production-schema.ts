import { migrateCampaignAudiences } from "./migrate-campaign-audiences";
import { migrateCreativeDocuments } from "./migrate-creative-documents";
import { migrateInitiatives } from "./migrate-initiatives";
import postgres from "postgres";
import {
  assertSchemaPushSucceeded,
  launchRetirementStatements,
} from "./production-schema-contract";

if (process.env.VERCEL_ENV !== "production") {
  console.log(
    `Skipping schema push (VERCEL_ENV=${process.env.VERCEL_ENV}, not production)`,
  );
  process.exit(0);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for production schema push");

// Remove child links first. drizzle-kit's table CASCADE otherwise removes the
// foreign keys before its later DROP CONSTRAINT, aborting the remaining diff.
const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
try {
  const source = await Bun.file(
    new URL("./retire-launch-schema.sql", import.meta.url),
  ).text();
  await client.begin(async (tx) => {
    for (const statement of launchRetirementStatements(source))
      await tx.unsafe(statement);
    await migrateInitiatives(tx);
    await migrateCampaignAudiences(tx);
    await migrateCreativeDocuments(tx, true);
  });
  console.log("Launch retirement and Initiative cutover committed.");
} finally {
  await client.end();
}

const child = Bun.spawn(["bun", "run", "db:push", "--force"], {
  stdout: "pipe",
  stderr: "pipe",
  env: process.env,
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
assertSchemaPushSucceeded({ exitCode, stdout, stderr });
