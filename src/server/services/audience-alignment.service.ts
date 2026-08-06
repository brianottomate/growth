import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type AudienceActivation,
  audienceActivationTable,
  audienceTable,
  type AudienceTarget,
  audienceTargetTable,
  channelTable,
} from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Audience intent vs. actual — the audience twin of ads-alignment. Strategy is
// audience_target.intendedChannels (the "who + where we want to reach them");
// reality is (a) planned per-platform activations and (b) mirrored `audience`
// rows synced from the platforms. Read-only grounding for the generative
// diagnosis capability + any UI.
// ---------------------------------------------------------------------------

export type AudienceChannelVerdict =
  /** A mirrored platform audience exists on the intended channel. */
  | "live"
  /** Only a planned activation exists — not yet mirrored from the platform. */
  | "planned"
  /** Neither a mirror nor a planned activation on an intended channel. */
  | "missing";

export type AudienceChannelAlignment = {
  platform: string;
  verdict: AudienceChannelVerdict;
  hasActivation: boolean;
  mirroredCount: number;
};

export type AudienceTargetAlignment = {
  targetId: string;
  name: string;
  status: AudienceTarget["status"];
  priority: AudienceTarget["priority"];
  intendedChannels: string[];
  channels: AudienceChannelAlignment[];
  /** Mirrored audiences on platforms the target never intended. */
  unplannedPlatforms: string[];
  /** must_have / should_have targets with no live coverage anywhere. */
  fullyUnfulfilled: boolean;
};

/** A mirrored `audience` row reduced to what the diff needs. */
export type MirroredAudience = { platform: string };

// ---- pure core (unit-tested) ----------------------------------------------

export function diffAudienceTarget(
  target: Pick<AudienceTarget, "id" | "name" | "status" | "priority"> & {
    intendedChannels: string[] | null;
  },
  activations: Pick<AudienceActivation, "platform" | "status">[],
  mirrored: MirroredAudience[],
): AudienceTargetAlignment {
  const intended = target.intendedChannels ?? [];
  const mirroredByPlatform = new Set<string>(mirrored.map((m) => m.platform));
  const activePlatforms = new Set<string>(
    activations.filter((a) => a.status !== "retired").map((a) => a.platform),
  );

  const channels: AudienceChannelAlignment[] = intended.map((platform) => {
    const mirroredCount = mirrored.filter(
      (m) => m.platform === platform,
    ).length;
    const hasActivation = activePlatforms.has(platform);
    const verdict: AudienceChannelVerdict = mirroredByPlatform.has(platform)
      ? "live"
      : hasActivation
        ? "planned"
        : "missing";
    return { platform, verdict, hasActivation, mirroredCount };
  });

  const unplannedPlatforms = [...mirroredByPlatform].filter(
    (p) => !intended.includes(p),
  );

  const anyLive = channels.some((c) => c.verdict === "live");
  const fullyUnfulfilled =
    (target.priority === "must_have" || target.priority === "should_have") &&
    intended.length > 0 &&
    !anyLive;

  return {
    targetId: target.id,
    name: target.name,
    status: target.status,
    priority: target.priority,
    intendedChannels: intended,
    channels,
    unplannedPlatforms,
    fullyUnfulfilled,
  };
}

// ---- db-backed entry point -------------------------------------------------

/** Audience alignment across a brand set (grounding for diagnosis). */
export async function computeAudienceAlignment(
  brandIds: string[],
): Promise<AudienceTargetAlignment[]> {
  if (brandIds.length === 0) return [];

  const targets = await db.query.audienceTargetTable.findMany({
    where: and(
      inArray(audienceTargetTable.brandId, brandIds),
      isNull(audienceTargetTable.deletedAt),
    ),
  });
  if (targets.length === 0) return [];

  const targetIds = targets.map((t) => t.id);

  const [activations, mirroredRows] = await Promise.all([
    db.query.audienceActivationTable.findMany({
      where: inArray(audienceActivationTable.targetId, targetIds),
      columns: { targetId: true, platform: true, status: true },
    }),
    // Mirrored audiences carry platform via their channel — join to resolve it.
    db
      .select({
        targetId: audienceTable.targetId,
        platform: channelTable.platform,
      })
      .from(audienceTable)
      .innerJoin(channelTable, eq(audienceTable.channelId, channelTable.id))
      .where(inArray(audienceTable.targetId, targetIds)),
  ]);

  const actByTarget = new Map<string, typeof activations>();
  for (const a of activations) {
    const arr = actByTarget.get(a.targetId) ?? [];
    arr.push(a);
    actByTarget.set(a.targetId, arr);
  }
  const mirrorByTarget = new Map<string, MirroredAudience[]>();
  for (const m of mirroredRows) {
    if (!m.targetId) continue;
    const arr = mirrorByTarget.get(m.targetId) ?? [];
    arr.push({ platform: m.platform });
    mirrorByTarget.set(m.targetId, arr);
  }

  return targets.map((t) =>
    diffAudienceTarget(
      t,
      actByTarget.get(t.id) ?? [],
      mirrorByTarget.get(t.id) ?? [],
    ),
  );
}
