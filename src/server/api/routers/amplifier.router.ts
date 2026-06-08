import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  amplificationTargetTable,
  amplifierTable,
  memberTable,
} from "@/server/db/schema";
import { discoverAmplifierHandles } from "@/server/services/social-discovery.service";

type Ctx = {
  db: typeof import("@/server/db").db;
  session: { user: { id: string } };
};

async function orgIdFor(ctx: Ctx): Promise<string | null> {
  const m = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
    with: { organization: true },
  });
  return m?.organization?.id ?? null;
}

const handleSchema = z.object({ platform: z.string(), handle: z.string() });

/**
 * Amplifiers — the lightweight contacts (investors / press / partners) recruited
 * to boost a launch, plus their per-moment targets. Discovery reuses the brand
 * social-handle flow (`discoverAmplifierHandles`).
 */
export const amplifierRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const org = await orgIdFor(ctx);
    if (!org) return [];
    return ctx.db.query.amplifierTable.findMany({
      where: eq(amplifierTable.organizationId, org),
      orderBy: [desc(amplifierTable.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        handles: z.array(handleSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      const [a] = await ctx.db
        .insert(amplifierTable)
        .values({
          organizationId: org,
          name: input.name,
          type: input.type,
          handles: input.handles ?? [],
        })
        .returning();
      return a;
    }),

  /** Discover the amplifier's social handles (same flow as brands). */
  discoverHandles: protectedProcedure
    .input(z.object({ amplifierId: z.string() }))
    .mutation(async ({ input }) => discoverAmplifierHandles(input.amplifierId)),

  /** Recruit an amplifier for a moment (the raised initiative). */
  addTarget: protectedProcedure
    .input(
      z.object({
        momentId: z.string(),
        amplifierId: z.string(),
        ask: z.string().optional(),
        plannedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [t] = await ctx.db
        .insert(amplificationTargetTable)
        .values({
          momentId: input.momentId,
          amplifierId: input.amplifierId,
          ask: input.ask ?? "planned",
          plannedAt: input.plannedAt ? new Date(input.plannedAt) : undefined,
        })
        .returning();
      return t;
    }),

  targetsForMoment: protectedProcedure
    .input(z.object({ momentId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db.query.amplificationTargetTable.findMany({
        where: eq(amplificationTargetTable.momentId, input.momentId),
        with: { amplifier: true },
      }),
    ),
});
