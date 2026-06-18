/**
 * Read prospect replies out of the Instantly Unibox — proves we can route
 * replies to a real person without touching Resend.
 *
 *   bun --conditions react-server scripts/instantly-replies.ts            # workspace-wide
 *   bun --conditions react-server scripts/instantly-replies.ts <campaign_id>
 *
 * Uses the new client methods: getUnreadCount + listEmails/getCampaignReplies
 * (preview_only=false → full reply body text).
 */
import {
  getCampaignReplies,
  getUnreadCount,
  listEmails,
} from "@/server/clients/instantly.client";

const campaignId = process.argv[2];

const unread = await getUnreadCount().catch(() => null);
console.log(`Unread in Unibox: ${unread?.count ?? "(n/a)"}\n`);

const replies = campaignId
  ? await getCampaignReplies(campaignId)
  : (await listEmails({ email_type: "received", preview_only: false, limit: 20 })).items;

console.log(`${replies.length} received email(s)${campaignId ? ` for campaign ${campaignId}` : " (workspace-wide, latest 20)"}:\n`);

for (const e of replies) {
  const when = e.timestamp_created?.slice(0, 16).replace("T", " ");
  const snippet = (e.body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  console.log(`• ${when} | from ${e.from_address_email ?? e.lead ?? "?"} → ${e.eaccount ?? "?"}`);
  console.log(`  subj: ${e.subject ?? "(none)"}`);
  if (snippet) console.log(`  ${snippet}${snippet.length >= 160 ? "…" : ""}`);
}

process.exit(0);
