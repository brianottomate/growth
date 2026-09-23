import {
  listAmplifiersOutputSchema,
  requestAmplificationOutputSchema,
  notifyAmplificationOutputSchema,
} from "./outputs/amplification";
import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { AMPLIFICATION_ACTIONS } from "@/lib/amplification-slack";
import { db } from "@/server/db";
import {
  amplificationTargetTable,
  amplifierTable,
  channelTable,
  platformPostLinkTable,
  platformPostTable,
} from "@/server/db/schema";
import { notifyAmplificationTarget } from "@/server/services/amplification-notification.service";
import { requireOwnedBrand } from "./brand-access";
import { growthAction } from "./types";

/**
 * Amplification — recruiting accounts to boost one platform post.
 *
 * Which posts deserve amplification is deliberately a judgment call made here
 * (by the operator steering the assistant), not a standing per-series rule.
 * Amplifiers with a linked owned brand get their repost draft minted
 * immediately — plans are cheap and reversible; delete the draft or rewind the
 * ask to stay honest about what actually happened.
 */

export const listAmplifiers = growthAction({
  outputSchema: listAmplifiersOutputSchema,
  description:
    "List the org's amplifier rolodex with each contact's ask history (planned/asked/confirmed/fulfilled counts). Use this to ground who to recruit before calling requestAmplification.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const amplifiers = await db.query.amplifierTable.findMany({
      where: and(
        eq(amplifierTable.organizationId, ctx.orgId),
        isNull(amplifierTable.deletedAt),
      ),
    });
    if (amplifiers.length === 0) {
      return { amplifiers: [], note: "Rolodex is empty." };
    }
    const targets = await db.query.amplificationTargetTable.findMany({
      where: inArray(
        amplificationTargetTable.amplifierId,
        amplifiers.map((amplifier) => amplifier.id),
      ),
      columns: { amplifierId: true, ask: true },
    });
    const historyFor = (amplifierId: string) => {
      const history = { planned: 0, asked: 0, confirmed: 0, fulfilled: 0 };
      for (const target of targets) {
        if (target.amplifierId !== amplifierId) continue;
        if (target.ask in history) {
          history[target.ask as keyof typeof history] += 1;
        }
      }
      return history;
    };
    return {
      amplifiers: amplifiers.map((amplifier) => ({
        id: amplifier.id,
        name: amplifier.name,
        type: amplifier.type,
        handles: amplifier.handles ?? [],
        linkedBrandId: amplifier.promotedBrandId,
        slackUserId: amplifier.slackUserId,
        notes: amplifier.notes,
        history: historyFor(amplifier.id),
      })),
    };
  },
});

export const requestAmplification = growthAction({
  outputSchema: requestAmplificationOutputSchema,
  description:
    "Plan human amplification for ONE platform post. Creates or updates one target per amplifier without contacting anyone. For repost or quote actions, amplifiers linked to an owned brand with a matching channel also get a linked draft. Use notifyAmplification separately, with approval, to send a Slack request.",
  inputSchema: z.object({
    platformPostId: z.string(),
    amplifierIds: z.array(z.string()).min(1).max(10),
    delayMinutes: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60)
      .default(180)
      .describe("Repost delay after the post's scheduled time"),
    note: z.string().trim().max(500).optional(),
    actionKind: z.enum(AMPLIFICATION_ACTIONS).default("repost"),
    draftText: z.string().trim().max(1500).optional(),
  }),
  execute: async (input, ctx) => {
    const post = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, input.platformPostId),
    });
    if (!post) throw new Error("Platform post not found.");
    await requireOwnedBrand(post.brandId, ctx);

    const amplifiers = await db.query.amplifierTable.findMany({
      where: and(
        inArray(amplifierTable.id, input.amplifierIds),
        eq(amplifierTable.organizationId, ctx.orgId),
        isNull(amplifierTable.deletedAt),
      ),
    });
    const missing = input.amplifierIds.filter(
      (id) => !amplifiers.some((amplifier) => amplifier.id === id),
    );
    if (missing.length > 0) {
      throw new Error(`Unknown amplifier ids: ${missing.join(", ")}`);
    }

    const plannedAt = post.scheduledAt
      ? new Date(post.scheduledAt.getTime() + input.delayMinutes * 60_000)
      : null;

    const results = [];
    for (const amplifier of amplifiers) {
      const [target] = await db
        .insert(amplificationTargetTable)
        .values({
          platformPostId: post.id,
          amplifierId: amplifier.id,
          ask: "planned",
          plannedAt,
          actionKind: input.actionKind,
          draftText: input.draftText ?? null,
          notes: input.note ?? null,
        })
        .onConflictDoUpdate({
          target: [
            amplificationTargetTable.platformPostId,
            amplificationTargetTable.amplifierId,
          ],
          set: {
            plannedAt,
            actionKind: input.actionKind,
            draftText: input.draftText ?? null,
            notes: input.note ?? null,
          },
        })
        .returning({ id: amplificationTargetTable.id });

      let mintedRepostId: string | null = null;
      let mode: "owned" | "ask" = "ask";
      if (
        amplifier.promotedBrandId &&
        (input.actionKind === "repost" || input.actionKind === "quote")
      ) {
        const channel = await db.query.channelTable.findFirst({
          where: and(
            eq(channelTable.brandId, amplifier.promotedBrandId),
            eq(channelTable.platform, post.platform),
            isNull(channelTable.deletedAt),
          ),
          columns: { id: true },
        });
        if (channel) {
          mode = "owned";
          // Dedupe: an existing repost link from this brand to this post means
          // the draft was already minted (here or by hand).
          const links = await db.query.platformPostLinkTable.findMany({
            where: eq(platformPostLinkTable.toPlatformPostId, post.id),
            with: { from: { columns: { id: true, brandId: true } } },
          });
          const existing = links.find(
            (link) => link.from?.brandId === amplifier.promotedBrandId,
          );
          if (existing) {
            mintedRepostId = existing.from?.id ?? null;
          } else {
            const [draft] = await db
              .insert(platformPostTable)
              .values({
                brandId: amplifier.promotedBrandId,
                channelId: channel.id,
                platform: post.platform,
                source: "owned",
                status: "draft",
                origin: "ai",
                ownerId: ctx.userId,
                text: [input.draftText, post.externalUrl]
                  .filter(Boolean)
                  .join("\n\n"),
                scheduledAt: plannedAt,
              })
              .returning({ id: platformPostTable.id });
            if (draft) {
              mintedRepostId = draft.id;
              await db.insert(platformPostLinkTable).values({
                fromPlatformPostId: draft.id,
                toPlatformPostId: post.id,
                kind: input.actionKind,
                injectUrlAtPublish: !post.externalUrl,
                metadata: { role: "amplifier", amplifierId: amplifier.id },
              });
            }
          }
        }
      }
      results.push({
        amplifier: amplifier.name,
        mode,
        target: target ? "saved" : "unchanged",
        mintedRepostId,
      });
    }
    return { ok: true as const, platformPostId: post.id, results };
  },
});

export const notifyAmplification = growthAction({
  outputSchema: notifyAmplificationOutputSchema,
  description:
    "Send one planned amplification request to the configured Slack channel and tag the amplifier by stored Slack member ID. This is an external message and requires explicit approval. Idempotent after Slack returns a persisted message receipt.",
  inputSchema: z.object({ targetId: z.string() }),
  execute: (input, ctx) =>
    notifyAmplificationTarget({
      targetId: input.targetId,
      organizationId: ctx.orgId,
    }),
});

export const AMPLIFICATION_TOOLS = {
  listAmplifiers,
  requestAmplification,
  notifyAmplification,
} as const;
