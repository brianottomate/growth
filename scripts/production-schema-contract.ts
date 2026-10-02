/** drizzle-kit can log a PostgreSQL failure and still exit zero. */
export function assertSchemaPushSucceeded(input: {
  exitCode: number;
  stdout: string;
  stderr: string;
}) {
  // Remove terminal colors before matching a reported exception, not SQL fields
  // such as `"error" text`. Keep the CLI transcript visible in the build logs.
  const transcript = `${input.stdout}\n${input.stderr}`.replace(
    /\u001b\[[0-9;]*m/g,
    "",
  );
  if (
    input.exitCode !== 0 ||
    /(?:^|\n)\s*(?:[A-Za-z]*Error|error):/m.test(transcript)
  )
    throw new Error(
      "Production schema push failed. Inspect the database error above; refusing to build or deploy the application.",
    );
}

/** The reviewed SQL is applied in one transaction owned by the caller. */
export function launchRetirementStatements(source: string): string[] {
  return source
    .replace(/^--.*$/gm, "")
    .replace(/^BEGIN;|^COMMIT;/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
