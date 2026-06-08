/**
 * Build a reply deep-link for a conversation.
 *
 * Per-platform, Zernio's own `url` is unusable for replying as the brand:
 *
 * - **Instagram**: Zernio gives `instagram.com/direct/t/<base64("ig_dm:"+threadKey)>/`,
 *   which doesn't resolve on the web. `ig.me/m/<username>` is Instagram's official
 *   click-to-message link and reliably opens the existing DM thread.
 *
 * - **Facebook**: Zernio gives `facebook.com/messages/t/<id>`, but that `id` is a
 *   *page-scoped* thread id — personal Messenger can't open it ("content isn't
 *   available"). FB page DMs live in the Meta Business Suite shared inbox, which
 *   deep-links a thread via `selected_item_id=<participant PSID>` + `thread_type=
 *   FB_MESSAGE`. We CAN'T build that link:
 *     - The `selected_item_id` is the participant's PSID (e.g. 100090326783125),
 *       NOT the thread id. Zernio exposes ONLY the thread id (`id`/`participantId`
 *       === `27638361942434480`); the PSID is in none of its conversation/message
 *       fields (verified 2026-06-08). Feeding the thread id into selected_item_id
 *       just renders a blank Messenger pane.
 *     - Graph API could resolve thread→PSID via `/{page}/conversations?fields=
 *       participants`, but our system-user token lacks `pages_messaging` (403), so
 *       that path is closed until the token gets a messaging-capable Page role.
 *   So we open the wanderfb Page inbox (Messenger tab, newest-first — the triaged
 *   thread is at the top). To make this per-thread: grant pages_messaging, resolve
 *   + cache the PSID at sync time, then key selected_item_id to it.
 *
 * - **Other platforms**: pass Zernio's `url` through unchanged.
 */

// Wander's Meta Business Suite identifiers (not secret — they appear in inbox
// URLs). Single connected FB Page today; move to env if more pages are added.
const FB_BUSINESS_ID = "472007163864199";
const FB_PAGE_ID = "101399685529192"; // wanderfb — asset_id === mailbox_id

const FB_INBOX_URL = `https://business.facebook.com/latest/inbox/all/?asset_id=${FB_PAGE_ID}&business_id=${FB_BUSINESS_ID}&mailbox_id=${FB_PAGE_ID}`;

export function conversationReplyUrl(c: {
  platform?: string;
  participantUsername?: string;
  url?: string;
}): string | undefined {
  if (c.platform === "instagram" && c.participantUsername) {
    return `https://ig.me/m/${encodeURIComponent(c.participantUsername)}`;
  }
  if (c.platform === "facebook") {
    return FB_INBOX_URL;
  }
  return c.url;
}
