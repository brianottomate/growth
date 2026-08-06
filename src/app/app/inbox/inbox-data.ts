import "server-only";

import { unstable_cache } from "next/cache";

import {
  getZernioConversationMessages,
  listAllDmConversations,
  listZernioConversations,
  type ZernioConversation,
  type ZernioMessage,
} from "@/server/clients/zernio.client";

// Most-recent conversations (Zernio returns newest-first). DMs aren't hard-windowed
// like Listen — an unanswered lead from 3 weeks ago still matters — so we bound by
// count, not date. Cached briefly; "Triage now" fetches fresh server-side.
export const INBOX_DMS_CACHE_TAG = "zernio-inbox-dms";

export const getRecentConversations = unstable_cache(
  async () => listZernioConversations({ limit: 50 }),
  ["zernio-conversations-v1"],
  { revalidate: 300, tags: [INBOX_DMS_CACHE_TAG] },
);

/** A conversation with its full message thread preloaded (oldest→newest). */
export interface ConversationWithThread {
  conversation: ZernioConversation;
  messages: ZernioMessage[];
}

// Cap the merged list (rendered + filterable), and — separately — how many of
// the most-recent get their thread prefetched. Threads beyond the cutoff render
// preview-only (the card falls back to lastMessage). This bounds per-call cost:
// X charges ~$0.01/read, and X DMs are older + mostly spam, so they naturally
// fall past the prefetch cutoff and stay preview-only unless they're active.
const MAX_CONVERSATIONS = 120;
const MAX_THREAD_FETCHES = 50;

// Zernio's message endpoint is ~1 call each; cap fan-out so we don't open many
// sockets at once. Load time is acceptable (the user is fine waiting to scan).
const THREAD_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Conversations across all DM platforms with threads preloaded up front. Fans
 * out per platform (so X DMs aren't crowded out by recent IG), merges newest
 * first, then prefetches threads for the most-recent {@link MAX_THREAD_FETCHES}
 * so those cards are self-contained; the rest render preview-only. Cached so the
 * cost is paid at most once per TTL.
 */
export const getRecentConversationsWithThreads = unstable_cache(
  async (): Promise<{ items: ConversationWithThread[] }> => {
    const { conversations } = await listAllDmConversations({
      perPlatformLimit: 50,
    });
    const sorted = conversations
      .filter(
        (c) => typeof c.id === "string" && typeof c.accountId === "string",
      )
      .slice(0, MAX_CONVERSATIONS);

    const items = await mapWithConcurrency(
      sorted,
      THREAD_CONCURRENCY,
      async (conversation, index) => {
        // Beyond the cutoff, skip the (possibly billed) thread read — the card
        // degrades to its lastMessage preview.
        if (index >= MAX_THREAD_FETCHES) {
          return {
            conversation,
            messages: [],
          } satisfies ConversationWithThread;
        }
        try {
          const { messages } = await getZernioConversationMessages(
            conversation.id!,
            { accountId: conversation.accountId!, limit: 50 },
          );
          return { conversation, messages } satisfies ConversationWithThread;
        } catch (error) {
          console.warn(
            `[inbox] thread fetch failed for ${conversation.id}:`,
            error,
          );
          return {
            conversation,
            messages: [],
          } satisfies ConversationWithThread;
        }
      },
    );

    return { items };
  },
  ["zernio-conversations-with-threads-v3-multiplatform"],
  { revalidate: 300, tags: [INBOX_DMS_CACHE_TAG] },
);
