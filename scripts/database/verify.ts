import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Client } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Never fall back to DATABASE_URL: these tests create and destroy a local database.
const testUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (
  !testUrl ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(testUrl).hostname)
)
  throw new Error(
    "Set MIGRATION_TEST_DATABASE_URL to a disposable local Postgres server",
  );
const name = `migration_test_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(testUrl);
url.pathname = `/${name}`;
const admin = new Client({ connectionString: testUrl });
const db = new Client({ connectionString: url.toString() });
const folder = resolve(import.meta.dir, "../../drizzle");
const scratch = mkdtempSync(join(tmpdir(), "growth-migrations-"));
const migrations = readMigrationFiles({ migrationsFolder: folder });
const ledger = async () =>
  (
    await db.query<{ hash: string; created_at: string }>(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id",
    )
  ).rows;

async function run(config = "drizzle.config.ts") {
  const child = Bun.spawn(
    ["bun", "x", "--no-install", "drizzle-kit", "migrate", "--config", config],
    {
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        DATABASE_URL_DIRECT: url.toString(),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr };
}

await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await db.connect();
  const first = await run();
  assert.equal(first.code, 0, first.output);
  assert.deepEqual(
    await ledger(),
    migrations.map((m) => ({
      hash: m.hash,
      created_at: String(m.folderMillis),
    })),
  );
  const before = await ledger();
  await db.query(
    "INSERT INTO brand(id,name,created_at,updated_at) VALUES ('one','One',now(),now()),('two','Two',now(),now())",
  );
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM home_group",
      )
    ).rows[0]?.count,
    2,
  );
  await db.query(
    "INSERT INTO home(id,brand_id,external_id,url,url_key,name,created_at,updated_at) VALUES ('home','one','external','https://example.com','home','Home',now(),now())",
  );
  await db.query(
    "INSERT INTO home_group_member(group_id,home_id) VALUES ('hgroup_featured_one','home')",
  );
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM home_group_member",
      )
    ).rows[0]?.count,
    1,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO home_group_member(group_id,home_id) VALUES ('hgroup_featured_two','home')",
    ),
    /same brand/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO booking_target(id,brand_id,name,home_id) VALUES ('target','two','Target','home')",
    ),
    /another brand/,
  );
  // A home that leaves the record leaves its groups.
  await db.query("UPDATE home SET deleted_at=now() WHERE id='home'");
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM home_group_member",
      )
    ).rows[0]?.count,
    0,
  );

  const repeat = await run();
  assert.equal(repeat.code, 0, repeat.output);
  assert.deepEqual(await ledger(), before);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM brand",
      )
    ).rows[0]?.count,
    2,
  );

  cpSync(folder, join(scratch, "drizzle"), { recursive: true });
  const journalPath = join(scratch, "drizzle/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: {
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }[];
  };
  const idx = journal.entries.length;
  const tag = `${String(idx).padStart(4, "0")}_deliberate_failure`;
  journal.entries.push({
    idx,
    version: "7",
    when: journal.entries[idx - 1]!.when + 1,
    tag,
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal));
  writeFileSync(
    join(scratch, `drizzle/${tag}.sql`),
    "CREATE TABLE migration_must_roll_back (id text);\n--> statement-breakpoint\nSELECT 1/0;",
  );
  const configPath = join(scratch, "drizzle.config.ts");
  writeFileSync(
    configPath,
    `export default { dialect: "postgresql", out: ${JSON.stringify(relative(process.cwd(), join(scratch, "drizzle")))}, dbCredentials: { url: process.env.DATABASE_URL } };`,
  );
  const failed = await run(configPath);
  assert.notEqual(failed.code, 0, "SQL errors must stop the release");
  assert.deepEqual(await ledger(), before);
  assert.equal(
    (
      await db.query<{ partial: string | null }>(
        "SELECT to_regclass('public.migration_must_roll_back') AS partial",
      )
    ).rows[0]?.partial,
    null,
  );
  console.log(
    "PASS: native CLI fresh install, repeat no-op with preserved data, failed SQL rolls back and exits nonzero, home-group and booking-target guards.",
  );
} finally {
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
  rmSync(scratch, { recursive: true, force: true });
}
