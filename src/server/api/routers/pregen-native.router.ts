import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  pregenNativeBuildTable,
  pregenNativeProspectTable,
} from "@/server/db/schema";
import { runBuild } from "@/server/services/pregen/pipeline";

/**
 * pregenNative — the growth-native pregen pipeline (crawl → generate →
 * artifact), fully independent of the monolith delegation flow that lives
 * on the leads router. One mutation starts a build; the build row's stepLog
 * is the progress feed.
 */
export const pregenNativeRouter = createTRPCRouter({
  startBuild: protectedProcedure
    .input(z.object({ url: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const origin = normalizeToOrigin(input.url);
      const domain = new URL(origin).hostname.replace(/^www\./, "");

      const [prospect] = await ctx.db
        .insert(pregenNativeProspectTable)
        .values({ sourceUrl: origin, domain, status: "building" })
        .onConflictDoUpdate({
          target: pregenNativeProspectTable.domain,
          set: { sourceUrl: origin, status: "building" },
        })
        .returning({
          id: pregenNativeProspectTable.id,
          previewToken: pregenNativeProspectTable.previewToken,
        });
      if (!prospect) throw new Error("failed to upsert pregen prospect");

      const [build] = await ctx.db
        .insert(pregenNativeBuildTable)
        .values({ prospectId: prospect.id })
        .returning({ id: pregenNativeBuildTable.id });
      if (!build) throw new Error("failed to create pregen build");

      after(async () => {
        await runBuild(build.id);
      });

      return {
        prospectId: prospect.id,
        buildId: build.id,
        previewPath: `/p/${prospect.previewToken}`,
      };
    }),

  getBuild: protectedProcedure
    .input(z.object({ buildId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.pregenNativeBuildTable.findFirst({
        where: eq(pregenNativeBuildTable.id, input.buildId),
        with: { prospect: true },
      });
    }),

  listProspects: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.pregenNativeProspectTable.findMany({
      orderBy: [desc(pregenNativeProspectTable.createdAt)],
      limit: 50,
      with: { builds: { orderBy: [desc(pregenNativeBuildTable.createdAt)], limit: 1 } },
    });
  }),
});

function normalizeToOrigin(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme).origin;
}
