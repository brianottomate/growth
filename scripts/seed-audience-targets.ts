/**
 * Seed a deliberately MINIMAL set of audience targets — the "who we want to
 * reach" intent layer on /app/audiences. Two per brand, no more: enough to
 * show the intent→coverage idea without overwhelming the strategy view.
 *
 *   bun run scripts/seed-audience-targets.ts
 *
 * Idempotent: upserts by (brand, name), tags `metadata.seed = true`, and
 * links existing platform audiences (matched by name) to each target so the
 * first impression is coverage, not a wall of gaps.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { audienceSlug } from "@/lib/audience-model";
import {
  audienceTable,
  audienceTargetTable,
  brandTable,
} from "@/server/db/schema";
import type {
  AudienceTargetPriority,
  AudienceTargetStatus,
  AudienceType,
} from "@/server/db/schema";

type SeedTarget = {
  name: string;
  type: AudienceType;
  status: AudienceTargetStatus;
  priority: AudienceTargetPriority;
  description: string;
  intendedChannels: string[];
  sizeGoalLabel?: string;
  /** Names of existing `audience` rows on the same brand to link. */
  linkAudiences: string[];
};

const TARGETS: Record<string, SeedTarget[]> = {
  wander: [
    {
      name: "Past-booker lookalikes",
      type: "lookalike",
      status: "active",
      priority: "must_have",
      description:
        "Travelers who look like the people who already book — the highest-confidence prospecting seed we have (660K+ traveler base).",
      intendedChannels: ["meta_ads"],
      sizeGoalLabel: "~2M",
      linkAudiences: ["Lookalike · past bookers"],
    },
    {
      name: "Remote workers (workcation)",
      type: "segment",
      status: "active",
      priority: "must_have",
      description:
        "Work-from-anywhere professionals who can take longer, off-peak stays — the natural fit for smart homes with fast WiFi and dedicated workspaces.",
      intendedChannels: ["meta_ads", "google_ads"],
      sizeGoalLabel: "~1M+",
      linkAudiences: ["CA Remote Workers · 28–45"],
    },
  ],
  wanderos: [
    {
      name: "STR property managers (5+ units)",
      type: "segment",
      status: "active",
      priority: "must_have",
      description:
        "Professional short-term-rental operators with a portfolio worth a branded direct-booking site — the core WanderOS buyer.",
      intendedChannels: ["meta_ads"],
      sizeGoalLabel: "~300K",
      linkAudiences: ["STR operators · 5+ units"],
    },
    {
      name: "Direct-booking intent",
      type: "intent",
      status: "active",
      priority: "should_have",
      description:
        "PMs actively researching direct bookings, OTA commissions, or a specific PMS (Hostaway, Guesty, Lodgify) — pre-qualified by what they're already looking for.",
      intendedChannels: ["meta_ads", "google_ads"],
      sizeGoalLabel: "~90K/mo",
      linkAudiences: ["Property-management intent"],
    },
  ],
};

async function main() {
  for (const [brandSlug, targets] of Object.entries(TARGETS)) {
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.slug, brandSlug),
    });
    if (!brand) {
      console.warn(`! no '${brandSlug}' brand — skipped`);
      continue;
    }
    console.log(`✓ brand: ${brand.name} (${brand.id})`);

    for (const t of targets) {
      let target = await db.query.audienceTargetTable.findFirst({
        where: and(
          eq(audienceTargetTable.brandId, brand.id),
          eq(audienceTargetTable.name, t.name),
          isNull(audienceTargetTable.deletedAt),
        ),
      });

      const values = {
        type: t.type,
        status: t.status,
        priority: t.priority,
        description: t.description,
        intendedChannels: t.intendedChannels,
        sizeGoalLabel: t.sizeGoalLabel ?? null,
        metadata: { seed: true },
      };

      if (target) {
        await db
          .update(audienceTargetTable)
          .set(values)
          .where(eq(audienceTargetTable.id, target.id));
        console.log(`  ↻ updated target "${t.name}"`);
      } else {
        [target] = await db
          .insert(audienceTargetTable)
          .values({
            brandId: brand.id,
            name: t.name,
            slug: audienceSlug(t.name),
            ...values,
          })
          .returning();
        console.log(`  + created target "${t.name}"`);
      }
      if (!target) throw new Error(`Failed to upsert target "${t.name}"`);

      // Link matching platform audiences (only ones not already mapped
      // elsewhere — don't steal links an operator set by hand).
      if (t.linkAudiences.length > 0) {
        const linked = await db
          .update(audienceTable)
          .set({ targetId: target.id })
          .where(
            and(
              eq(audienceTable.brandId, brand.id),
              inArray(audienceTable.name, t.linkAudiences),
              isNull(audienceTable.targetId),
            ),
          )
          .returning({ name: audienceTable.name });
        if (linked.length > 0)
          console.log(
            `    · linked ${linked.length} audience(s): ${linked.map((l) => l.name).join(", ")}`,
          );
      }
    }
  }

  console.log("✓ done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
