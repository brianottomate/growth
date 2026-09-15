/**
 * Print every email account connected to Instantly — settles "do we have a
 * burner Gmail / what identity + domain do we actually send from?".
 *
 * Read-only. Run: bun --conditions react-server scripts/instantly-accounts.ts
 */
import { listAccounts } from "@/server/clients/instantly.client";

// Instantly provider_code → label (best-effort; raw code printed too).
const PROVIDER: Record<number, string> = {
  1: "Custom IMAP/SMTP",
  2: "Google",
  3: "Microsoft / O365",
};
// account status: 1 active, 2 paused, -1 error, -2 no reconnect, -3 reconnecting.
const STATUS: Record<number, string> = {
  1: "active",
  2: "paused",
  "-1": "error",
  "-2": "needs-reconnect",
  "-3": "reconnecting",
};

let cursor: string | undefined;
let total = 0;
const byDomain: Record<string, number> = {};

for (let page = 0; page < 20; page++) {
  const res = await listAccounts({
    limit: 100,
    include_tags: true,
    ...(cursor ? { starting_after: cursor } : {}),
  });
  for (const a of res.items) {
    total++;
    const domain = a.email.split("@")[1] ?? "?";
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
    const provider =
      PROVIDER[a.provider_code ?? -999] ?? `code ${a.provider_code}`;
    const status = STATUS[a.status] ?? `status ${a.status}`;
    const warm =
      a.warmup_status === 1
        ? "warming"
        : a.warmup_status === 0
          ? "off"
          : `w:${a.warmup_status}`;
    const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
    console.log(
      `${a.email.padEnd(34)} | ${name.padEnd(18)} | ${provider.padEnd(16)} | ${status.padEnd(15)} | ${warm.padEnd(8)} | limit ${a.daily_limit ?? "—"} | track-domain ${a.tracking_domain_name ?? "—"}`,
    );
  }
  if (!res.next_starting_after || res.items.length === 0) break;
  cursor = res.next_starting_after;
}

console.log(`\nTotal connected accounts: ${total}`);
console.log("By sending domain:", byDomain);
process.exit(0);
