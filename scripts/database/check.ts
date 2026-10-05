import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

const migrationFolder = resolve(import.meta.dir, "../../drizzle");
const migrations = readMigrationFiles({ migrationsFolder: migrationFolder });
// Use the installed CLI rather than Kit internal snapshot types. Generate into
// a throwaway copy so checking cannot rewrite committed SQL or snapshots.
const scratch = mkdtempSync(join(tmpdir(), "growth-schema-check-"));
try {
  cpSync(migrationFolder, scratch, { recursive: true });
  const child = Bun.spawn(
    [
      "bun",
      "x",
      "--no-install",
      "drizzle-kit",
      "generate",
      "--schema",
      "./src/server/db/schema.ts",
      "--dialect",
      "postgresql",
      "--casing",
      "snake_case",
      "--out",
      relative(process.cwd(), scratch),
      "--name",
      "uncommitted_schema",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`Migration generation check failed: ${stdout}\n${stderr}`);
  if (
    readdirSync(scratch).filter((file) => file.endsWith(".sql")).length !==
    migrations.length
  )
    throw new Error(
      "Schema changes are missing a migration. Run bun run db:generate and review the SQL.",
    );
  if (!stdout.includes("No schema changes, nothing to migrate"))
    throw new Error(
      `Migration generation did not complete: ${stdout}\n${stderr}`,
    );
  console.log(
    `Migration files readable (${migrations.length} files); Drizzle schema matches the latest snapshot.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
