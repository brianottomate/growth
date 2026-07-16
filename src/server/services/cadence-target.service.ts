import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { withTransaction } from "@/server/db";
import { cadenceTargetTable, mixTargetTable } from "@/server/db/schema";
import type { ChannelPlatform } from "@/server/db/channel-schema";
import { platformFormatsFor } from "@/server/content/formats";

export type CadenceTargetInput = {
  archetype: string;
  count: number;
  period: "day" | "week" | "month";
};

export type MixTargetInput = {
  pillar: string;
  targetPct: number;
};

/** Replace one channel's ordinary cadence as one transaction. Template-scoped
 * targets are intentionally preserved; this editor owns the channel baseline. */
export async function replaceChannelCadence(input: {
  brandId: string;
  channelId: string;
  platform: ChannelPlatform;
  targets: CadenceTargetInput[];
}) {
  const supported = new Set<string>(
    platformFormatsFor(input.platform).map((format) => format.archetype),
  );
  const seen = new Set<string>();
  for (const target of input.targets) {
    if (!supported.has(target.archetype)) {
      throw new Error(
        `${target.archetype} is not a supported ${input.platform} format.`,
      );
    }
    if (seen.has(target.archetype)) {
      throw new Error(
        `Duplicate ${input.platform}/${target.archetype} target.`,
      );
    }
    seen.add(target.archetype);
  }

  return withTransaction(async (tx) => {
    await tx
      .delete(cadenceTargetTable)
      .where(
        and(
          eq(cadenceTargetTable.channelId, input.channelId),
          isNull(cadenceTargetTable.template),
        ),
      );

    if (input.targets.length === 0) return [];
    return tx
      .insert(cadenceTargetTable)
      .values(
        input.targets.map((target) => ({
          brandId: input.brandId,
          channelId: input.channelId,
          platform: input.platform,
          archetype: target.archetype,
          count: target.count,
          period: target.period,
          isActive: true,
        })),
      )
      .returning({
        archetype: cadenceTargetTable.archetype,
        count: cadenceTargetTable.count,
        period: cadenceTargetTable.period,
      });
  });
}

/** Replace the brand-default content mix while preserving channel overrides. */
export async function replaceBrandMixTargets(input: {
  brandId: string;
  targets: MixTargetInput[];
}) {
  const seen = new Set<string>();
  let total = 0;
  for (const target of input.targets) {
    if (!target.pillar.trim()) throw new Error("Mix pillars cannot be empty.");
    if (seen.has(target.pillar)) {
      throw new Error(`Duplicate mix target for ${target.pillar}.`);
    }
    if (target.targetPct <= 0 || target.targetPct > 100) {
      throw new Error("Mix percentages must be between 1 and 100.");
    }
    seen.add(target.pillar);
    total += target.targetPct;
  }
  if (total !== 100) {
    throw new Error(`Brand mix must total 100%, not ${total}%.`);
  }

  return withTransaction(async (tx) => {
    await tx
      .delete(mixTargetTable)
      .where(
        and(
          eq(mixTargetTable.brandId, input.brandId),
          isNull(mixTargetTable.channelId),
        ),
      );

    return tx
      .insert(mixTargetTable)
      .values(
        input.targets.map((target) => ({
          brandId: input.brandId,
          pillar: target.pillar,
          targetPct: target.targetPct,
          period: "week" as const,
          isActive: true,
        })),
      )
      .returning({
        pillar: mixTargetTable.pillar,
        targetPct: mixTargetTable.targetPct,
        period: mixTargetTable.period,
      });
  });
}
