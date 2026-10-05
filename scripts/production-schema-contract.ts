/** The reviewed SQL is applied in one transaction owned by the caller. */
export function launchRetirementStatements(source: string): string[] {
  return source
    .replace(/^--.*$/gm, "")
    .replace(/^BEGIN;|^COMMIT;/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
