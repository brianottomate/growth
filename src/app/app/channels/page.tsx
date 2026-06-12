import { redirect } from "next/navigation";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  cadenceTargetTable,
  channelTable,
  memberTable,
  mixTargetTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelsClient, type BrandChannels } from "./ChannelsClient";

const WINDOW_DAYS = 28;
const WEEKS = WINDOW_DAYS / 7;
// Normalize a target count to per-week so observed and target are comparable.
const perWeek = (count: number, period: string) =>
  period === "week" ? count : period === "day" ? count * 7 : count / 4.345;

/**
 * /channels — channel × brand legibility: each owned channel's voice
 * fingerprint, its observed publishing cadence (last 4 weeks, from the
 * classified platform_posts) vs its cadence_target, and each brand's pillar
 * content mix vs its mix_target. The "are we executing the strategy?" view.
 */
export default async function ChannelsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground p-8">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true },
  });
  const brandIds = brands.map((b) => b.id);
  if (!brandIds.length) {
    return <ChannelsClient brands={[]} windowDays={WINDOW_DAYS} />;
  }

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [channels, posts, cadence, mix] = await Promise.all([
    db.query.channelTable.findMany({
      where: and(inArray(channelTable.brandId, brandIds), eq(channelTable.isActive, true)),
      columns: {
        id: true,
        brandId: true,
        platform: true,
        handle: true,
        followerCount: true,
        channelFingerprint: true,
      },
    }),
    db.query.platformPostTable.findMany({
      where: and(
        inArray(platformPostTable.brandId, brandIds),
        gte(platformPostTable.publishedAt, cutoff),
      ),
      columns: { brandId: true, platform: true, archetype: true },
      with: { contentPost: { columns: { pillar: true } } },
    }),
    db.query.cadenceTargetTable.findMany({
      where: and(
        inArray(cadenceTargetTable.brandId, brandIds),
        eq(cadenceTargetTable.isActive, true),
      ),
    }),
    db.query.mixTargetTable.findMany({
      where: and(
        inArray(mixTargetTable.brandId, brandIds),
        eq(mixTargetTable.isActive, true),
      ),
    }),
  ]);

  const data: BrandChannels[] = brands.map((b) => {
    const bPosts = posts.filter((p) => p.brandId === b.id);

    // Pillar content mix (observed % vs target %).
    const mixCounts = new Map<string, number>();
    for (const p of bPosts) {
      const pil = p.contentPost?.pillar ?? "__unsorted";
      mixCounts.set(pil, (mixCounts.get(pil) ?? 0) + 1);
    }
    const targetByPillar = new Map(
      mix.filter((m) => m.brandId === b.id).map((m) => [m.pillar, m.targetPct]),
    );
    const mixTotal = bPosts.length;
    const mixRows = [...new Set([...mixCounts.keys(), ...targetByPillar.keys()])]
      .map((pillar) => {
        const count = mixCounts.get(pillar) ?? 0;
        return {
          pillar,
          count,
          pct: mixTotal ? Math.round((count / mixTotal) * 100) : 0,
          targetPct: targetByPillar.get(pillar) ?? null,
        };
      })
      .sort((x, y) => y.count - x.count);

    // Per-channel observed cadence (by archetype) vs target.
    const channelRows = channels
      .filter((c) => c.brandId === b.id)
      .map((c) => {
        const cPosts = bPosts.filter((p) => p.platform === c.platform);
        const archCounts = new Map<string, number>();
        for (const p of cPosts) {
          const a = p.archetype ?? "other";
          archCounts.set(a, (archCounts.get(a) ?? 0) + 1);
        }
        const targetByArch = new Map(
          cadence
            .filter((t) => t.channelId === c.id)
            .map((t) => [t.archetype, perWeek(t.count, t.period)]),
        );
        const archetypes = [
          ...new Set([...archCounts.keys(), ...targetByArch.keys()]),
        ]
          .map((archetype) => ({
            archetype,
            perWeek: (archCounts.get(archetype) ?? 0) / WEEKS,
            target: targetByArch.get(archetype) ?? null,
          }))
          .sort((x, y) => y.perWeek - x.perWeek || (y.target ?? 0) - (x.target ?? 0));
        return {
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          followerCount: c.followerCount,
          fingerprint: c.channelFingerprint?.fingerprintText ?? null,
          postsInWindow: cPosts.length,
          archetypes,
        };
      });

    return { id: b.id, name: b.name, mixRows, mixTotal, channels: channelRows };
  });

  return <ChannelsClient brands={data} windowDays={WINDOW_DAYS} />;
}
