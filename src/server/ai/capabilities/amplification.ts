import {
  notifyAmplificationNativeResultSchema,
  listAmplifiersOutputSchema,
  requestAmplificationOutputSchema,
  notifyAmplificationOutputSchema,
  savedAmplifierOutputSchema,
  amplificationTargetsOutputSchema,
} from "./outputs/amplification";

import "server-only";
import {
  amplificationPlatformSchema,
  amplificationAskSchema,
  amplificationActionSchema,
  assertAmplificationAction,
  assertAmplificationOutputIdentity,
} from "@/lib/amplification-plan";
import { amplifierHandlesAccount } from "@/server/services/amplification-matching";
import { getInitiative } from "@/server/services/initiative.service";

import { and, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { isSlackMemberId } from "@/lib/amplification-slack";
import { db, withTransaction } from "@/server/db";
import {
  amplificationTargetTable,
  amplifierTable,
  contentPostTable,
  brandTable,
  platformPostLinkTable,
  platformPostTable,
} from "@/server/db/schema";
import { notifyAmplificationTarget } from "@/server/services/amplification-notification.service";
import { requireOwnedBrand, requireVisibleBrand } from "./brand-access";
import { growthAction, type CapabilityContext } from "./types";

/**
 * Amplification — recruiting accounts to boost one platform post.
 *
 * Which posts deserve amplification is deliberately a judgment call made here
 * (by the operator steering the assistant), not a standing per-series rule.
 * Contacts can optionally link a personal brand. Creating a managed output is
 * a separate explicit action and never connects an account or publishes.
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
      orderBy: [desc(amplifierTable.createdAt)],
    });
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        eq(brandTable.type, "personal"),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
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
      brands,
      amplifiers: amplifiers.map((amplifier) => ({
        id: amplifier.id,
        name: amplifier.name,
        type: amplifier.type,
        handles: amplifier.handles ?? [],
        linkedBrandId: amplifier.linkedBrandId,
        slackUserId: amplifier.slackUserId,
        handoffPreference: amplifier.handoffPreference,
        notes: amplifier.notes,
        history: historyFor(amplifier.id),
      })),
    };
  },
});

/** Save one destination/action assignment. Repeating the request preserves operator work. */
export const requestAmplification = growthAction({
  outputSchema: requestAmplificationOutputSchema,
  description:
    "Plan ONE amplification assignment for one person, source, destination and action. Idempotent; does not send messages, create output drafts, or publish. Use createOutput separately for a linked personal brand, even without a connected account.",
  inputSchema: z.object({
    platformPostId: z.string(),
    amplifierId: z.string(),
    destinationPlatform: amplificationPlatformSchema,
    actionKind: amplificationActionSchema.default("repost"),
    draftText: z.string().trim().max(10000).optional(),
    note: z.string().trim().max(2000).optional(),
    plannedAt: z.iso.datetime().optional(),
  }),
  execute: async (input, ctx) => {
    const post = await db.query.platformPostTable.findFirst({
      where: eq(platformPostTable.id, input.platformPostId),
    });
    if (!post) throw new Error("Source post not found");
    await requireOwnedBrand(post.brandId, ctx);
    await ownedAmplifier(input.amplifierId, ctx);
    assertAmplificationAction(
      post.platform,
      input.destinationPlatform,
      input.actionKind,
    );
    const target = await withTransaction(async (tx) => {
      await tx
        .insert(amplificationTargetTable)
        .values({
          platformPostId: post.id,
          amplifierId: input.amplifierId,
          destinationPlatform: input.destinationPlatform,
          actionKind: input.actionKind,
          draftText: input.draftText,
          notes: input.note,
          plannedAt: input.plannedAt ? new Date(input.plannedAt) : null,
        })
        .onConflictDoNothing();
      const [saved] = await tx
        .select()
        .from(amplificationTargetTable)
        .where(
          and(
            eq(amplificationTargetTable.platformPostId, post.id),
            eq(amplificationTargetTable.amplifierId, input.amplifierId),
            eq(
              amplificationTargetTable.destinationPlatform,
              input.destinationPlatform,
            ),
            eq(amplificationTargetTable.actionKind, input.actionKind),
          ),
        );
      if (!saved) throw new Error("Assignment was not saved");
      return saved;
    });
    return {
      ok: true as const,
      targetId: target.id,
      outputPlatformPostId: target.outputPlatformPostId,
    };
  },
});

async function ownedAmplifier(id: string, ctx: CapabilityContext) {
  const amplifier = await db.query.amplifierTable.findFirst({
    where: and(
      eq(amplifierTable.id, id),
      eq(amplifierTable.organizationId, ctx.orgId),
      isNull(amplifierTable.deletedAt),
    ),
  });
  if (!amplifier) throw new Error("Amplifier not found in this workspace");
  return amplifier;
}
async function ownedTarget(id: string, ctx: CapabilityContext) {
  const target = await db.query.amplificationTargetTable.findFirst({
    where: eq(amplificationTargetTable.id, id),
    with: { platformPost: true },
  });
  if (!target) throw new Error("Assignment not found");
  const amplifier = await ownedAmplifier(target.amplifierId, ctx);
  await requireOwnedBrand(target.platformPost.brandId, ctx);
  return { target, amplifier };
}

export const saveAmplifier = growthAction({
  outputSchema: savedAmplifierOutputSchema,
  description:
    "Create or edit ONE private amplifier contact. Optionally link an existing personal brand in this workspace; a Zernio connection is not required. Linking preserves assignments. Manual handoff is the default; Slack preference does not send a message.",
  inputSchema: z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(150).optional(),
    type: z.string().max(100).nullable().optional(),
    handles: z
      .array(
        z.object({
          platform: z.string().min(1).max(60),
          handle: z.string().trim().min(1).max(150),
        }),
      )
      .max(20)
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
    slackUserId: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isSlackMemberId)
      .nullable()
      .optional(),
    linkedBrandId: z.string().nullable().optional(),
    handoffPreference: z.enum(["manual", "slack"]).optional(),
  }),
  execute: async (input, ctx) => {
    const existing = input.id ? await ownedAmplifier(input.id, ctx) : null;
    if (!existing && !input.name)
      throw new Error("Name is required for a new contact");
    if (input.linkedBrandId) {
      const brand = await requireOwnedBrand(input.linkedBrandId, ctx);
      if (brand.type !== "personal")
        throw new Error("Link a personal brand for this amplifier");
    }
    return withTransaction(async (tx) => {
      if (existing) {
        const [lockedContact] = await tx
          .select()
          .from(amplifierTable)
          .where(eq(amplifierTable.id, existing.id))
          .for("update");
        if (!lockedContact || lockedContact.deletedAt)
          throw new Error("Amplifier was removed");
        if (
          input.linkedBrandId !== undefined &&
          input.linkedBrandId !== lockedContact.linkedBrandId
        ) {
          const [draft] = await tx
            .select({ id: amplificationTargetTable.id })
            .from(amplificationTargetTable)
            .where(
              and(
                eq(amplificationTargetTable.amplifierId, existing.id),
                isNotNull(amplificationTargetTable.outputPlatformPostId),
              ),
            )
            .limit(1);
          if (draft)
            throw new Error(
              "This contact has output drafts. Keep their publishing identity linked.",
            );
        }
      }
      const { id: _id, ...patch } = input;
      const [saved] = existing
        ? await tx
            .update(amplifierTable)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(amplifierTable.id, existing.id))
            .returning({ id: amplifierTable.id })
        : await tx
            .insert(amplifierTable)
            .values({ ...patch, name: input.name!, organizationId: ctx.orgId })
            .returning({ id: amplifierTable.id });
      if (!saved) throw new Error("Contact was not saved");
      return { id: saved.id };
    });
  },
});

export const createAmplificationOutput = growthAction({
  outputSchema: requestAmplificationOutputSchema.extend({
    outputPlatformPostId: z.string(),
  }),
  description:
    "Create ONE output draft under the amplifier’s linked personal brand, reusing it on retries. Works without a connected account. Moves suggested copy into the draft as its single editable source. Does not schedule, publish, or send.",
  inputSchema: z.object({ targetId: z.string() }),
  execute: async ({ targetId }, ctx) => {
    const { target, amplifier } = await ownedTarget(targetId, ctx);
    if (!amplifier.linkedBrandId)
      throw new Error(
        "Link a personal brand first, or keep suggested copy on the assignment for manual handoff.",
      );
    const brand = await requireOwnedBrand(amplifier.linkedBrandId, ctx);
    return withTransaction(async (tx) => {
      const [contact] = await tx
        .select()
        .from(amplifierTable)
        .where(eq(amplifierTable.id, amplifier.id))
        .for("update");
      if (contact?.deletedAt || contact?.linkedBrandId !== brand.id)
        throw new Error("Amplifier identity changed; refresh and try again");
      const [locked] = await tx
        .select()
        .from(amplificationTargetTable)
        .where(eq(amplificationTargetTable.id, target.id))
        .for("update");
      if (!locked) throw new Error("Assignment was removed");
      if (locked.outputPlatformPostId) {
        const [output] = await tx
          .select()
          .from(platformPostTable)
          .where(eq(platformPostTable.id, locked.outputPlatformPostId));
        if (!output) throw new Error("Output draft not found");
        assertAmplificationOutputIdentity(
          brand.id,
          locked.destinationPlatform,
          output,
        );
        return { ok: true as const, targetId, outputPlatformPostId: output.id };
      }
      if (locked.ask === "fulfilled")
        throw new Error("This assignment is already complete");
      if (locked.actionKind === "comment")
        throw new Error(
          "Keep a comment as an assignment; it is not a standalone post draft.",
        );
      const platform = amplificationPlatformSchema.parse(
        locked.destinationPlatform,
      );
      const [output] = await tx
        .insert(platformPostTable)
        .values({
          brandId: brand.id,
          platform,
          source: "owned",
          status: "draft",
          origin: "human",
          username:
            contact.handles?.find((h) => h.platform === platform)?.handle ??
            null,
          ownerId: ctx.userId,
          text: locked.draftText,
          metadata: { amplification: { targetId, amplifierId: amplifier.id } },
        })
        .returning();
      if (!output) throw new Error("Output draft was not created");
      await tx.insert(platformPostLinkTable).values({
        fromPlatformPostId: output.id,
        toPlatformPostId: locked.platformPostId,
        kind: locked.actionKind,
        injectUrlAtPublish: false,
        metadata: { amplificationTargetId: targetId },
      });
      await tx
        .update(amplificationTargetTable)
        .set({ outputPlatformPostId: output.id, draftText: null })
        .where(eq(amplificationTargetTable.id, targetId));
      return { ok: true as const, targetId, outputPlatformPostId: output.id };
    });
  },
});

export const updateAmplification = growthAction({
  outputSchema: requestAmplificationOutputSchema,
  description:
    "Edit ONE assignment’s status, suggested copy, notes, or requested time. Once an output draft exists, edit copy on that platform post instead. Optional fulfillment evidence must match the amplifier and destination; cross-platform adaptations are never inferred automatically.",
  inputSchema: z.object({
    targetId: z.string(),
    ask: amplificationAskSchema.optional(),
    draftText: z.string().max(10000).nullable().optional(),
    outputText: z.string().max(10000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    plannedAt: z.iso.datetime().nullable().optional(),
    fulfilledByPostId: z.string().nullable().optional(),
  }),
  execute: async (input, ctx) => {
    const { target, amplifier } = await ownedTarget(input.targetId, ctx);
    if (input.fulfilledByPostId) {
      const output = await db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.fulfilledByPostId),
      });
      if (!output) throw new Error("Fulfillment post not found");
      await requireVisibleBrand(output.brandId, ctx);
      if (
        output.platform !== target.destinationPlatform ||
        (!output.publishedAt && output.status !== "published") ||
        !(
          amplifier.linkedBrandId === output.brandId ||
          amplifierHandlesAccount(
            amplifier.handles,
            output.platform,
            output.username,
          )
        )
      )
        throw new Error(
          "Fulfillment must be a published post from this amplifier on the destination platform",
        );
      if (input.ask && input.ask !== "fulfilled")
        throw new Error("Fulfillment evidence requires completed status");
    }
    return withTransaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(amplificationTargetTable)
        .where(eq(amplificationTargetTable.id, target.id))
        .for("update");
      if (!locked) throw new Error("Assignment was removed");
      if (input.draftText !== undefined && locked.outputPlatformPostId)
        throw new Error(
          "Edit copy on the linked output draft; the assignment no longer stores a separate draft.",
        );
      if (input.fulfilledByPostId) {
        const existing = await tx.query.platformPostLinkTable.findFirst({
          where: and(
            eq(
              platformPostLinkTable.fromPlatformPostId,
              input.fulfilledByPostId,
            ),
            eq(platformPostLinkTable.toPlatformPostId, locked.platformPostId),
            eq(platformPostLinkTable.kind, locked.actionKind),
          ),
        });
        if (!existing)
          await tx.insert(platformPostLinkTable).values({
            fromPlatformPostId: input.fulfilledByPostId,
            toPlatformPostId: locked.platformPostId,
            kind: locked.actionKind,
            injectUrlAtPublish: false,
            metadata: { amplificationTargetId: locked.id },
          });
      }
      if (input.outputText !== undefined) {
        if (!locked.outputPlatformPostId || !amplifier.linkedBrandId)
          throw new Error("No linked output draft");
        await requireOwnedBrand(amplifier.linkedBrandId, ctx);
        const [output] = await tx
          .select()
          .from(platformPostTable)
          .where(eq(platformPostTable.id, locked.outputPlatformPostId))
          .for("update");
        if (!output) throw new Error("Output draft not found");
        assertAmplificationOutputIdentity(
          amplifier.linkedBrandId,
          locked.destinationPlatform,
          output,
        );
        if (
          !["draft", "slot", "rejected"].includes(output.status) ||
          output.deliveryExternalId ||
          output.publishedAt ||
          output.scheduledAt
        )
          throw new Error(
            "Reopen this output as a draft before editing its copy",
          );
        await tx
          .update(platformPostTable)
          .set({ text: input.outputText })
          .where(eq(platformPostTable.id, output.id));
      }
      const ask = input.fulfilledByPostId ? "fulfilled" : input.ask;
      await tx
        .update(amplificationTargetTable)
        .set({
          updatedAt: new Date(),
          ask,
          draftText: input.draftText,
          notes: input.notes,
          plannedAt:
            input.plannedAt === undefined
              ? undefined
              : input.plannedAt
                ? new Date(input.plannedAt)
                : null,
          fulfilledAt:
            ask === undefined
              ? undefined
              : ask === "fulfilled"
                ? (locked.fulfilledAt ?? new Date())
                : null,
          fulfilledByPostId:
            ask && ask !== "fulfilled" ? null : input.fulfilledByPostId,
        })
        .where(eq(amplificationTargetTable.id, target.id));
      return {
        ok: true as const,
        targetId: target.id,
        outputPlatformPostId: locked.outputPlatformPostId,
      };
    });
  },
});

export const readAmplificationTargets = growthAction({
  outputSchema: amplificationTargetsOutputSchema,
  description:
    "Read assignments for one initiative or content post, including source, destination, amplifier, handoff, and output draft. Initiative results include posts inherited from linked series.",
  inputSchema: z
    .object({
      initiativeId: z.string().optional(),
      contentPostId: z.string().optional(),
    })
    .refine(
      (v) => Number(!!v.initiativeId) + Number(!!v.contentPostId) === 1,
      "Choose one initiative or content post",
    ),
  execute: async (input, ctx) => {
    const contents = input.initiativeId
      ? (await getInitiative(input.initiativeId, ctx.orgId)).contentPosts
      : [];
    if (input.contentPostId) {
      const content = await db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
      });
      if (!content) throw new Error("Content post not found");
      await requireOwnedBrand(content.brandId, ctx);
      contents.push({ ...content, direct: true });
    }
    if (!contents.length) return { targets: [], posts: [] };
    const posts = await db.query.platformPostTable.findMany({
      where: inArray(
        platformPostTable.contentPostId,
        contents.map((p) => p.id),
      ),
    });
    const targets = posts.length
      ? await db.query.amplificationTargetTable.findMany({
          where: inArray(
            amplificationTargetTable.platformPostId,
            posts.map((p) => p.id),
          ),
          with: { amplifier: true, outputPlatformPost: true },
          orderBy: [desc(amplificationTargetTable.createdAt)],
        })
      : [];
    return {
      posts: posts
        .filter(
          (p) => amplificationPlatformSchema.safeParse(p.platform).success,
        )
        .map((p) => ({
          id: p.id,
          contentPostId: p.contentPostId,
          platform: p.platform,
          title: contents.find((c) => c.id === p.contentPostId)?.title ?? null,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
        })),
      targets: targets
        .filter(
          (t) =>
            t.amplifier.organizationId === ctx.orgId && !t.amplifier.deletedAt,
        )
        .map((t) => ({
          id: t.id,
          platformPostId: t.platformPostId,
          amplifierId: t.amplifierId,
          destinationPlatform: t.destinationPlatform,
          actionKind: t.actionKind,
          ask: t.ask,
          draftText: t.outputPlatformPost
            ? t.outputPlatformPost.text
            : t.draftText,
          notes: t.notes,
          plannedAt: t.plannedAt?.toISOString() ?? null,
          outputPlatformPostId: t.outputPlatformPostId,
          outputStatus: t.outputPlatformPost?.status ?? null,
          fulfilledByPostId: t.fulfilledByPostId,
          slackStatus: t.slackStatus,
          amplifier: {
            id: t.amplifier.id,
            name: t.amplifier.name,
            type: t.amplifier.type,
            linkedBrandId: t.amplifier.linkedBrandId,
            handoffPreference: t.amplifier.handoffPreference,
            slackUserId: t.amplifier.slackUserId,
            handles: t.amplifier.handles ?? [],
          },
        })),
    };
  },
});

export const notifyAmplification = growthAction({
  nativeOutputSchema: notifyAmplificationNativeResultSchema,
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
  saveAmplifier,
  createAmplificationOutput,
  updateAmplification,
  readAmplificationTargets,
} as const;
