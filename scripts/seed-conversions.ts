/**
 * Bootstrap the ad conversion-tracking matrix from the "Tracking Directory –
 * WanderOS" spreadsheet into Neon. Lays down the canonical Wander funnel events
 * (the intent spine) and the per-platform conversion mappings (the reality
 * cells), all as `status: "wanted"`. An AI agent later reads wander.com +
 * tracking code and flips statuses / reconciles `canonicalEvent`.
 *
 *   bun run scripts/seed-conversions.ts
 *
 * Idempotent and SAFE TO RE-RUN: upserts by stable keys
 *   - conversion_event       (brandId, name)
 *   - conversion_mapping      (brandId, platform, platformEventName)
 *   - conversion_mapping_source  composite PK (onConflictDoNothing)
 * Re-runs refresh only sheet-derived structural fields and DO NOT clobber
 * agent-owned fields (status, canonicalEvent, notes) — those are insert-only,
 * so the AI verification pass survives a re-seed.
 *
 * NOTE: no `server-only` imports — runs under plain `bun run` (do not import
 * ads-sync.service.ts; the channel upsert is inlined below).
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  conversionEventTable,
  conversionMappingSourceTable,
  conversionMappingTable,
} from "@/server/db/schema";
import type {
  ChannelPlatform,
  ConversionFunnel,
  ConversionMode,
} from "@/server/db/schema";

const BRAND_SLUG = "wander";

// ---- EVENT SPINE (canonical Wander funnel events) ----
// canonicalEvent: the real tracking-plan event name; null = not-yet-tracked /
// unreconciled (the AI pass fills these in).
type SeedEvent = {
  name: string;
  canonicalEvent: string | null;
  funnel: ConversionFunnel;
  stage: number;
  isPrimary?: boolean;
  description?: string;
};

const EVENTS: SeedEvent[] = [
  // Supply (≈ WANDER_OS workspace)
  {
    name: "WanderOS Inbound Clicked",
    canonicalEvent: "WanderOS Inbound Clicked",
    funnel: "supply",
    stage: 1,
  },
  {
    name: "WanderOS Inbound Submitted",
    canonicalEvent: "WanderOS Inbound Submitted",
    funnel: "supply",
    stage: 2,
    isPrimary: true,
  },
  {
    name: "List Apply Clicked",
    canonicalEvent: "List Apply Clicked",
    funnel: "supply",
    stage: 3,
  },
  {
    name: "List Apply Submitted",
    canonicalEvent: "List Apply Submitted",
    funnel: "supply",
    stage: 4,
    isPrimary: true,
  },
  {
    name: "Signed Up",
    canonicalEvent: "Signed Up",
    funnel: "supply",
    stage: 5,
  },
  {
    name: "Org Created",
    canonicalEvent: null,
    funnel: "supply",
    stage: 6,
    description:
      "No exact canonical event yet — closest are User Set Organizations / Organization Name Updated. Needs reconciliation.",
  },
  {
    name: "PMS Connected",
    canonicalEvent: "Onboarding Completed",
    funnel: "supply",
    stage: 7,
    description:
      "Tentative: no distinct PMS-connected event; Onboarding Completed carries pms_name. Verify in code.",
  },
  {
    name: "Live",
    canonicalEvent: "Site Published",
    funnel: "supply",
    stage: 8,
  },
  // Demand (≈ WANDER_COM workspace)
  {
    name: "Property Reserve Clicked",
    canonicalEvent: null,
    funnel: "demand",
    stage: 1,
    description:
      "No clear canonical match yet (Book Live Clicked?). Needs reconciliation.",
  },
  {
    name: "Checkout Previewed",
    canonicalEvent: "Checkout Previewed",
    funnel: "demand",
    stage: 2,
  },
  {
    name: "Payment Info Submitted",
    canonicalEvent: "Payment Info Entered",
    funnel: "demand",
    stage: 3,
  },
  {
    name: "Order Completed",
    canonicalEvent: "Order Completed",
    funnel: "demand",
    stage: 4,
    isPrimary: true,
  },
];

// ---- PLATFORM MAPPINGS (per-platform conversions) ----
// sourceEvents: names from the spine that feed this conversion (1+; Reddit's
// single Lead is fed by two). For Meta, the raw sheet source label is preserved
// in `notes` for the AI pass since it differs from the spine name.
type SeedMapping = {
  platform: ChannelPlatform;
  platformEventName: string;
  externalConversionId: string | null;
  mode: ConversionMode | null;
  sourceEvents: string[];
  notes?: string;
};

const MAPPINGS: SeedMapping[] = [
  // Google Ads — one conversion label per Wander event (platform leaves the
  // "platform event" blank, so we use the Wander event name as the label).
  {
    platform: "google_ads",
    platformEventName: "WanderOS Inbound Clicked",
    externalConversionId: "AW-11520295109/xIEGCPn80bAcEMWBp_Uq",
    mode: "once",
    sourceEvents: ["WanderOS Inbound Clicked"],
  },
  {
    platform: "google_ads",
    platformEventName: "WanderOS Inbound Submitted",
    externalConversionId: "AW-11520295109/vkUECJivmZUcEMWBp_Uq",
    mode: "every",
    sourceEvents: ["WanderOS Inbound Submitted"],
  },
  {
    platform: "google_ads",
    platformEventName: "List Apply Clicked",
    externalConversionId: "AW-11520295109/fqj8CLSzubAcEMWBp_Uq",
    mode: "once",
    sourceEvents: ["List Apply Clicked"],
  },
  {
    platform: "google_ads",
    platformEventName: "List Apply Submitted",
    externalConversionId: "AW-11520295109/onMTCJ6-mJccEMWBp_Uq",
    mode: "every",
    sourceEvents: ["List Apply Submitted"],
  },

  // LinkedIn Ads
  {
    platform: "linkedin_ads",
    platformEventName: "Lead",
    externalConversionId: "26084452",
    mode: "once",
    sourceEvents: ["WanderOS Inbound Clicked"],
  },
  {
    platform: "linkedin_ads",
    platformEventName: "Submit Application",
    externalConversionId: "26084460",
    mode: "every",
    sourceEvents: ["WanderOS Inbound Submitted"],
  },
  {
    platform: "linkedin_ads",
    platformEventName: "Sign up",
    externalConversionId: "26084468",
    mode: "once",
    sourceEvents: ["List Apply Clicked"],
  },
  {
    platform: "linkedin_ads",
    platformEventName: "Qualified Lead",
    externalConversionId: "26084476",
    mode: "every",
    sourceEvents: ["List Apply Submitted"],
  },

  // Meta Ads — no conversion IDs wired yet; sheet source labels differ from the
  // spine and are preserved in notes for reconciliation.
  {
    platform: "meta_ads",
    platformEventName: "Contact",
    externalConversionId: null,
    mode: null,
    sourceEvents: ["WanderOS Inbound Submitted"],
    notes:
      'Sheet source label: "Submitted Sites Get Started Form" — confirm mapping.',
  },
  {
    platform: "meta_ads",
    platformEventName: "Subscribe",
    externalConversionId: null,
    mode: null,
    sourceEvents: ["WanderOS Inbound Clicked"],
    notes: 'Sheet source label: "Clicked to get started" — confirm mapping.',
  },
  {
    platform: "meta_ads",
    platformEventName: "Start Trial",
    externalConversionId: null,
    mode: null,
    sourceEvents: ["PMS Connected"],
    notes:
      'Sheet source label: "Onboarding Completed" (app.wander.com) — confirm mapping.',
  },
  {
    platform: "meta_ads",
    platformEventName: "Website Lead",
    externalConversionId: null,
    mode: null,
    sourceEvents: ["Org Created"],
    notes:
      'Sheet source label: "Organization Created" (app.wander.com) — confirm mapping.',
  },

  // Reddit Ads — single standard "Lead" pixel (no per-conversion id), shared by
  // BOTH submit events. The many-to-one case the join table exists for.
  {
    platform: "reddit_ads",
    platformEventName: "Lead",
    externalConversionId: null,
    mode: null,
    sourceEvents: ["WanderOS Inbound Submitted", "List Apply Submitted"],
    notes:
      "Single Lead pixel shared by two Wander events; fires via tracking-web reddit provider (standard event, no per-conversion id).",
  },
];

// Ad channels to ensure exist (kind: "ad"). meta_ads / google_ads are NOT
// created here — linked only if a channel already exists (e.g. from Zernio sync).
const ENSURE_AD_CHANNELS: { platform: ChannelPlatform; displayName: string }[] =
  [
    { platform: "reddit_ads", displayName: "Reddit Ads" },
    { platform: "linkedin_ads", displayName: "LinkedIn Ads" },
  ];

async function main() {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, BRAND_SLUG),
  });
  if (!brand) {
    console.warn(`! no '${BRAND_SLUG}' brand — nothing to seed`);
    process.exit(1);
  }
  console.log(`✓ brand: ${brand.name} (${brand.id})`);

  // --- 1. Resolve / create ad channels, build platform → channelId map ---
  const channelByPlatform = new Map<string, string>();

  // Ensure reddit_ads + linkedin_ads channels (idempotent, mirrors syncZernioAds).
  for (const { platform, displayName } of ENSURE_AD_CHANNELS) {
    let channel = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, brand.id),
        eq(channelTable.platform, platform),
      ),
    });
    if (!channel) {
      [channel] = await db
        .insert(channelTable)
        .values({ brandId: brand.id, kind: "ad", platform, displayName })
        .returning();
      console.log(`  + created channel ${displayName}`);
    } else {
      console.log(`  · channel ${displayName} exists`);
    }
    if (channel) channelByPlatform.set(platform, channel.id);
  }

  // Link meta_ads / google_ads conversions to existing channels if present.
  for (const platform of ["meta_ads", "google_ads"] as ChannelPlatform[]) {
    const channel = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, brand.id),
        eq(channelTable.platform, platform),
      ),
    });
    if (channel) channelByPlatform.set(platform, channel.id);
    else
      console.log(
        `  · no ${platform} channel yet — mappings stay channelId=null`,
      );
  }

  // --- 2. Upsert event spine by (brandId, name) ---
  const eventIdByName = new Map<string, string>();
  for (const e of EVENTS) {
    let row = await db.query.conversionEventTable.findFirst({
      where: and(
        eq(conversionEventTable.brandId, brand.id),
        eq(conversionEventTable.name, e.name),
      ),
    });
    if (row) {
      // Update only structural fields; leave canonicalEvent/description (agent-owned).
      await db
        .update(conversionEventTable)
        .set({
          funnel: e.funnel,
          stage: e.stage,
          isPrimary: e.isPrimary ?? false,
        })
        .where(eq(conversionEventTable.id, row.id));
      console.log(`  ↻ event "${e.name}"`);
    } else {
      [row] = await db
        .insert(conversionEventTable)
        .values({
          brandId: brand.id,
          name: e.name,
          canonicalEvent: e.canonicalEvent,
          funnel: e.funnel,
          stage: e.stage,
          isPrimary: e.isPrimary ?? false,
          description: e.description ?? null,
        })
        .returning();
      console.log(`  + event "${e.name}"`);
    }
    if (!row) throw new Error(`Failed to upsert event "${e.name}"`);
    eventIdByName.set(e.name, row.id);
  }

  // --- 3. Upsert mappings by (brandId, platform, platformEventName) ---
  for (const m of MAPPINGS) {
    const channelId = channelByPlatform.get(m.platform) ?? null;
    let row = await db.query.conversionMappingTable.findFirst({
      where: and(
        eq(conversionMappingTable.brandId, brand.id),
        eq(conversionMappingTable.platform, m.platform),
        eq(conversionMappingTable.platformEventName, m.platformEventName),
      ),
    });
    if (row) {
      // Refresh sheet-derived fields only; preserve status + notes (agent-owned).
      await db
        .update(conversionMappingTable)
        .set({
          externalConversionId: m.externalConversionId,
          mode: m.mode,
          channelId,
        })
        .where(eq(conversionMappingTable.id, row.id));
      console.log(`  ↻ mapping ${m.platform} · ${m.platformEventName}`);
    } else {
      [row] = await db
        .insert(conversionMappingTable)
        .values({
          brandId: brand.id,
          platform: m.platform,
          channelId,
          platformEventName: m.platformEventName,
          externalConversionId: m.externalConversionId,
          mode: m.mode,
          status: "wanted",
          notes: m.notes ?? null,
        })
        .returning();
      console.log(`  + mapping ${m.platform} · ${m.platformEventName}`);
    }
    if (!row)
      throw new Error(
        `Failed to upsert mapping ${m.platform}/${m.platformEventName}`,
      );

    // --- 4. Wire join rows (idempotent) ---
    for (const srcName of m.sourceEvents) {
      const eventId = eventIdByName.get(srcName);
      if (!eventId) {
        console.warn(
          `    ! source event "${srcName}" not found — skipped link`,
        );
        continue;
      }
      await db
        .insert(conversionMappingSourceTable)
        .values({ mappingId: row.id, conversionEventId: eventId })
        .onConflictDoNothing();
    }
    if (m.sourceEvents.length > 1)
      console.log(`    · shared by ${m.sourceEvents.length} events`);
  }

  console.log("✓ done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
