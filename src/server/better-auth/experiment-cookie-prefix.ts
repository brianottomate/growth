import { createHash } from "node:crypto";

/** Separate session stores cannot share a session token. Ports and checkouts can. */
export function experimentCookiePrefix(input: {
  nodeEnv: string;
  experimentBranch?: string;
  databaseUrl: string;
}) {
  if (input.nodeEnv !== "development" || !input.experimentBranch)
    return undefined;
  const database = new URL(input.databaseUrl);
  const host = database.hostname.replace(/-pooler(?=\.)/, "");
  const identity = `${host}:${database.port || "5432"}${decodeURIComponent(database.pathname)}`;
  const fingerprint = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 16);
  return `growth-experiment-${fingerprint}`;
}
