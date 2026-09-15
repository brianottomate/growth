/**
 * register-instantly-webhook.ts — register the workspace-wide Instantly reply
 * webhook pointing at the deployed handler. Run AFTER the handler is deployed
 * (Instantly pings the URL; a 404 would fail registration).
 *
 *   bun --conditions react-server scripts/register-instantly-webhook.ts
 *
 * Idempotent-ish: lists existing webhooks first and skips if one already points
 * at the same URL + event. Set INSTANTLY_WEBHOOK_SECRET in env first.
 */
import { env } from "@/env";
import { createWebhook, listWebhooks } from "@/server/clients/instantly.client";

const HOOK_URL = "https://growth-red.vercel.app/api/instantly/webhook";
const EVENT = "reply_received" as const;

if (!env.INSTANTLY_WEBHOOK_SECRET) {
  console.error("INSTANTLY_WEBHOOK_SECRET not set — aborting");
  process.exit(1);
}

const existing = await listWebhooks();
const dupe = existing.items.find(
  (w) => w.target_hook_url === HOOK_URL && w.event_type === EVENT,
);
if (dupe) {
  console.log(`already registered (${dupe.id}) → ${HOOK_URL} [${EVENT}]`);
  process.exit(0);
}

const hook = await createWebhook({
  target_hook_url: HOOK_URL,
  event_type: EVENT,
  name: "growth reply sync",
  // Workspace-wide (no campaign filter) — catches all campaigns.
  headers: { "x-webhook-secret": env.INSTANTLY_WEBHOOK_SECRET },
});

console.log(`registered webhook ${hook.id} → ${HOOK_URL} [${EVENT}]`);
process.exit(0);
