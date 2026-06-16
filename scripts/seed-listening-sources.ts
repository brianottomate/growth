/**
 * Phase-1 listening config seed. ADDITIVE and idempotent — changes no runtime
 * behaviour (rows are shadow=true, read for comparison only until each hardcoded
 * constant is retired). Mirrors today's constants into listening_source rows and
 * seeds the shared brand listening story.
 *
 * Run: bun --conditions react-server run scripts/seed-listening-sources.ts
 */
import { eq } from "drizzle-orm";

import { X_WATCHLIST } from "@/lib/x-watchlist";
import { db } from "@/server/db";
import {
  type BrandListeningStory,
  brandTable,
  listeningSourceTable,
  type ListeningSourceInsert,
} from "@/server/db/schema";

// Initial subreddit list (now lives in the listening_source row; this seed is
// the one-time mirror of the previously-hardcoded constant).
const INITIAL_SUBREDDITS = [
  "ShortTermRentals",
  "AirbnbHosts",
  "VRBOHosts",
  "PropertyManagement",
  "airbnb",
  "vrbo",
  "realestateinvesting",
  "Landlord",
];

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "wander"),
});
if (!brand)
  throw new Error("No brand with slug 'wander' found — adjust the lookup.");
console.log(`[seed-listening] brand: ${brand.name} (${brand.id})`);

// ---- Shared brand listening story (voice still comes from brandFingerprint) ----
const STORY: BrandListeningStory = {
  productBoilerplate: `Wander has three products relevant to listening:
- WanderOS — direct-booking software for short-term-rental operators (cut OTA fees, own the guest relationship).
- Wander Sites — branded direct-booking websites for operators.
- Wander Operated — full-service property management.`,
  signalGuidance: `Most chatter is noise — be discerning. Reserve high relevance (8+) for posts where a Wander product genuinely solves the poster's problem and engaging would add value.
High-signal: people complaining about / switching from OTAs (Airbnb, VRBO) or competitors (Hostaway, Guesty, OwnerRez, Hospitable, Lodgify, Streamline, Escapia); asking for direct-booking solutions; or actively evaluating alternatives ("alternative to", "switching from", "anyone using", "vs", "recommend", "OTA fees", "direct booking"). Brand mentions of Wander itself are always worth a look. Generic travel chatter is noise.`,
  replyGuidance: `Wander sounds like the friend who always finds the best place to stay — warm, quietly authoritative, never try-hard. The Wander Test: before posting, ask "could this reply only come from Wander?" If not, rewrite it.
Lead with empathy and value, never a pitch. Disclose Wander affiliation. Never name competitors directly when piling on. Move refunds/reservations and anything sensitive to DM/concierge.`,
  updatedBy: "seed-listening-sources",
};

if (!brand.brandListeningStory) {
  await db
    .update(brandTable)
    .set({ brandListeningStory: STORY })
    .where(eq(brandTable.id, brand.id));
  console.log("[seed-listening] seeded brand.brandListeningStory");
} else {
  console.log(
    "[seed-listening] brand.brandListeningStory already set — left as-is",
  );
}

// ---- Listening source rows (mirror today's hardcoded constants) ----
const rows: ListeningSourceInsert[] = [
  {
    brandId: brand.id,
    key: "reddit-str-ops",
    platform: "reddit",
    acquisition: "keyword_search",
    trigger: "on_demand",
    adapter: "reddit-json",
    label: "Reddit — STR operator subs",
    config: { subreddits: [...INITIAL_SUBREDDITS] },
    shadow: false, // retired: reddit-monitor now reads subreddits from this row
  },
  {
    brandId: brand.id,
    key: "x-watchlist",
    platform: "x",
    acquisition: "keyword_search",
    trigger: "on_demand", // becomes "scheduled" once it's a cron
    adapter: "x-search",
    label: "X — brand & competitor watchlist",
    config: {
      watchlistGroups: X_WATCHLIST.map((g) => ({
        id: g.id,
        name: g.name,
        terms: [...g.terms],
      })),
    },
    shadow: true,
  },
  {
    brandId: brand.id,
    key: "f5bot",
    platform: "reddit", // F5Bot spans reddit/hn/lobsters; mention.source carries the actual surface
    acquisition: "provider_alert",
    trigger: "webhook",
    adapter: "f5bot",
    label: "F5Bot keyword alerts (Reddit / HN / Lobsters)",
    config: {},
    shadow: false, // already the live path — not being compared against a constant
  },
  {
    brandId: brand.id,
    key: "zernio-dms",
    platform: "instagram",
    acquisition: "owned_inbound",
    trigger: "on_demand",
    adapter: "zernio-dms",
    label: "DMs (Zernio)",
    config: {},
    shadow: true,
  },
  {
    brandId: brand.id,
    key: "zernio-comments-ig",
    platform: "instagram",
    acquisition: "owned_inbound",
    trigger: "on_demand",
    adapter: "zernio-comments",
    label: "Comments — Instagram",
    config: {},
    shadow: true,
  },
  {
    brandId: brand.id,
    key: "zernio-comments-fb",
    platform: "facebook",
    acquisition: "owned_inbound",
    trigger: "on_demand",
    adapter: "zernio-comments",
    label: "Comments — Facebook",
    config: {},
    shadow: true,
  },
  {
    brandId: brand.id,
    key: "zernio-comments-li",
    platform: "linkedin",
    acquisition: "owned_inbound",
    trigger: "on_demand",
    adapter: "zernio-comments",
    label: "Comments — LinkedIn",
    config: {},
    shadow: true,
  },
];

const inserted = await db
  .insert(listeningSourceTable)
  .values(rows)
  .onConflictDoNothing()
  .returning();

console.log(
  `[seed-listening] inserted ${inserted.length}/${rows.length} listening_source rows (rest already existed)`,
);
process.exit(0);
