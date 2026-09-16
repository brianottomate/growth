/**
 * Listening config seed. ADDITIVE and idempotent — mirrors today's constants
 * into listening_source rows (which are authoritative: scans + reply drafts
 * read their config from here) and seeds the shared brand listening story.
 *
 * Run: bun --conditions react-server run scripts/seed-listening-sources.ts
 */
import { and, eq } from "drizzle-orm";

import { X_WATCHLIST } from "@/lib/x-watchlist";
import { db } from "@/server/db";
import {
  type BrandListeningStory,
  brandTable,
  type ListeningAlertTerm,
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

// F5Bot alert terms — MIRRORED from the live F5Bot dashboard (the source of
// truth). Keep this list in sync with F5Bot; `verifiedAt` is bumped whenever we
// confirm alignment. F5Bot is one channel; if we move to Mentionkit the terms
// move with us. Casing + flags match the F5Bot config exactly (F5Bot lowercases
// and matches case-insensitively). The brand / location / intent terms were
// added 2026-09-16 for the Colleen Barndt brand-monitoring request. F5Bot's free
// plan has no boolean operators, so the requested `NOT lang:de` / `NOT WanderOn`
// exclusions can't be expressed; relevance scoring filters that noise instead.
const F5BOT_VERIFIED_AT = "2026-09-16";
const WHOLE_REDDIT = ["whole", "only-reddit"];
const WHOLE_REDDIT_NO_COMMENTS = ["whole", "only-reddit", "no-comments"];
const alert = (term: string, flags: string[]): ListeningAlertTerm => ({
  term,
  flags,
  enabled: true,
  verifiedAt: F5BOT_VERIFIED_AT,
});
const F5BOT_ALERT_TERMS: ListeningAlertTerm[] = [
  // STR-operator discovery terms
  alert("airbnb alternatives", WHOLE_REDDIT_NO_COMMENTS),
  alert("airbnb fees", WHOLE_REDDIT_NO_COMMENTS),
  alert("vrbo alternatives", WHOLE_REDDIT_NO_COMMENTS),
  alert("channel manager", WHOLE_REDDIT),
  alert("direct booking", WHOLE_REDDIT),
  alert("direct booking site", WHOLE_REDDIT),
  alert("direct booking website", WHOLE_REDDIT),
  alert("ditch airbnb", WHOLE_REDDIT),
  alert("fire my property manager", WHOLE_REDDIT),
  alert("guesty alternative", WHOLE_REDDIT),
  alert("hostaway alternative", WHOLE_REDDIT),
  alert("property management software", WHOLE_REDDIT),
  alert("vacation rental software", WHOLE_REDDIT),
  // Wander brand / product
  alert("wander.com", []),
  alert("wanderos", WHOLE_REDDIT),
  alert("wander listed", WHOLE_REDDIT),
  alert("wander operated", WHOLE_REDDIT),
  alert("wander sites", WHOLE_REDDIT),
  alert("wander for operators", WHOLE_REDDIT),
  alert("wander app", WHOLE_REDDIT),
  alert("wander membership", WHOLE_REDDIT),
  alert("wander concierge", WHOLE_REDDIT),
  alert("wander owned", WHOLE_REDDIT),
  alert("wander branded", WHOLE_REDDIT),
  // Wander property locations
  alert("wander joshua tree", WHOLE_REDDIT),
  alert("wander tahoe", WHOLE_REDDIT),
  alert("wander lake tahoe", WHOLE_REDDIT),
  alert("wander ponte vedra", WHOLE_REDDIT),
  alert("wander hollywood hills", WHOLE_REDDIT),
  alert("wander kure beach", WHOLE_REDDIT),
  alert("wander atlantic city", WHOLE_REDDIT),
  alert("wander st. george island", WHOLE_REDDIT),
  alert("wander hudson valley", WHOLE_REDDIT),
  alert("wander palm springs", WHOLE_REDDIT),
  alert("wander yucca valley", WHOLE_REDDIT),
  alert("wander malibu", WHOLE_REDDIT),
  alert("wander kissimmee", WHOLE_REDDIT),
  alert("wander sonoma", WHOLE_REDDIT),
  alert("wander longboat", WHOLE_REDDIT),
  // Booking / host-intent language
  alert("wander rentals", WHOLE_REDDIT),
  alert("wander vacation rental", WHOLE_REDDIT),
  alert("wander vacation home", WHOLE_REDDIT),
  alert("wander smart home rental", WHOLE_REDDIT),
  alert("stayed at a wander", WHOLE_REDDIT),
  alert("book a wander", WHOLE_REDDIT),
  alert("wander property manager", WHOLE_REDDIT),
  alert("wander host fee", WHOLE_REDDIT),
  alert("wander homeowner", WHOLE_REDDIT),
  alert("wander vs vrbo", WHOLE_REDDIT),
  alert("wander vs airbnb", WHOLE_REDDIT),
  alert("partnership with wander", WHOLE_REDDIT),
  // Wander domains (whole-word so wander.co doesn't match every wander.com)
  alert("wander.ca", WHOLE_REDDIT),
  alert("wander.co", WHOLE_REDDIT),
  alert("wander.io", WHOLE_REDDIT),
  alert("wanderapp.com", WHOLE_REDDIT),
  // Brand tagline
  alert("not your typical vacation rental", WHOLE_REDDIT),
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
  },
  {
    brandId: brand.id,
    key: "f5bot",
    platform: "reddit", // F5Bot spans reddit/hn/lobsters; mention.source carries the actual surface
    acquisition: "provider_alert",
    trigger: "webhook",
    adapter: "f5bot",
    label: "F5Bot keyword alerts (Reddit / HN / Lobsters)",
    config: { alertTerms: F5BOT_ALERT_TERMS },
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

// Align the F5Bot alert terms even when the row already existed (onConflictDoNothing
// skips updates) — F5Bot's dashboard is the source of truth, so we always mirror it.
const [aligned] = await db
  .update(listeningSourceTable)
  .set({ config: { alertTerms: F5BOT_ALERT_TERMS } })
  .where(
    and(
      eq(listeningSourceTable.brandId, brand.id),
      eq(listeningSourceTable.key, "f5bot"),
    ),
  )
  .returning();
console.log(
  `[seed-listening] aligned F5Bot alert terms: ${aligned ? F5BOT_ALERT_TERMS.length : 0} terms (verified ${F5BOT_VERIFIED_AT})`,
);
process.exit(0);
