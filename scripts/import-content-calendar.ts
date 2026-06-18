/**
 * Import the team's June + July 2026 Google-Sheet content calendar into the
 * content model — and kill the spreadsheet.
 *
 *   bun --conditions react-server run scripts/import-content-calendar.ts
 *
 * The sheet conflates idea and spot: "Jun 17 IG" and "Jun 17 TikTok" are two
 * rows but ONE idea. This COLLAPSES rows sharing a (date + concept) into a
 * single `content_post` (the editorial brief, written once) that fans out to
 * one `platform_post` spot per platform. Series are seeded straight from the
 * Series column (the team already did that taxonomy). Owners resolve to real
 * users; Google-Drive links land in `platform_post.assetLinks` (no migration).
 *
 * Idempotent: deletes prior import rows (by metadata marker) and re-creates
 * Wander's series each run. Existing Wander series are intentionally dropped
 * (sign-off: "feel free to kill my existing series").
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  contentPostTable,
  platformPostTable,
  seriesTable,
  type ContentStatus,
} from "@/server/db/schema";

const MARKER = "jun-jul-2026-calendar";
const WANDER_BRAND_ID = "brand_a9dmzvEZB4y9WY4M";
const SILVINA_USER_ID = "SdY7Z6SS30HbZs4jJPRzn9QvixwwOTRi";

// Sheet owner text → real user id (null = leave unassigned, keep the name).
const OWNERS: Record<string, string | null> = {
  silvina: SILVINA_USER_ID,
  nibble: null, // a content source, not a user — preserved in metadata
};

// Sheet pillar label → pillar slug (lib/pillars). "Inspiration" isn't in the
// 5-pillar legend; route it to the existing travel-inspiration slug.
const PILLARS: Record<string, string> = {
  "timely travel": "timely-travel",
  "travel discovery": "travel-discovery",
  "brand & trust": "brand-trust",
  entertainment: "entertainment",
  "insider community": "insider-community",
  inspiration: "travel-inspiration",
};

// A series-name normaliser — light merges only; otherwise keep the team's name.
function normaliseSeries(name: string): string {
  const n = name.trim();
  if (/^summer unlocked/i.test(n)) return "Summer Unlocked";
  return n;
}

const SERIES_COLORS = [
  "#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa",
  "#22d3ee", "#fb7185", "#4ade80", "#facc15", "#c084fc",
  "#38bdf8", "#f87171", "#2dd4bf", "#e879f9", "#fdba74",
];

type Platform = "instagram" | "tiktok" | "pinterest" | "youtube";

function parsePlatforms(raw: string): Platform[] {
  const r = raw.toLowerCase();
  const out = new Set<Platform>();
  if (/\big\b|instagram/.test(r)) out.add("instagram");
  if (/tiktok|tt\b/.test(r)) out.add("tiktok");
  if (r.includes("pinterest")) out.add("pinterest");
  if (/youtube|shorts/.test(r)) out.add("youtube");
  return [...out];
}

/** Map (platform, sheet format text) → {format id, archetype, template}. */
function mapFormat(pf: Platform, raw: string): {
  format: string;
  archetype: string;
  template: string | null;
} {
  const r = (raw || "").toLowerCase();
  let template: string | null = null;
  if (r.includes("pov")) template = "pov";
  else if (r.includes("talking head")) template = "talking_head";

  const isCarousel = /carousel|carrousel|pins?\b|slides?/.test(r);
  const isStory = /story|stories/.test(r);

  switch (pf) {
    case "instagram":
      if (isStory) return { format: "instagram.story", archetype: "story", template };
      if (isCarousel) return { format: "instagram.carousel", archetype: "carousel", template };
      return { format: "instagram.reel", archetype: "video_short", template };
    case "tiktok":
      if (isCarousel) return { format: "tiktok.photo", archetype: "carousel", template };
      return { format: "tiktok.video", archetype: "video_short", template };
    case "pinterest":
      if (r.includes("idea pin")) return { format: "pinterest.idea_pin", archetype: "carousel", template };
      return { format: "pinterest.pin", archetype: "image", template };
    case "youtube":
      return { format: "youtube.short", archetype: "video_short", template };
  }
}

function mapStatus(raw: string): ContentStatus {
  const t = (raw || "").toLowerCase();
  if (t.includes("posted") || t.includes("published")) return "published";
  if (t.includes("approved")) return "approved";
  return "draft"; // "Planned" / blank → draft, but still date-placed
}

const URL_RE = /https?:\/\/[^\s)]+/g;
function extractUrls(...parts: (string | undefined)[]): string[] {
  const text = parts.filter(Boolean).join("\n");
  return [...(text.match(URL_RE) ?? [])];
}
function stripUrls(s: string | undefined): string {
  if (!s) return "";
  return s.replace(URL_RE, "").replace(/\s+/g, " ").trim();
}

// ---- THE SHEET ------------------------------------------------------------
// One object per sheet row (June + July + the Pinterest sub-tab net-new rows).
// mo = month (6 | 7), d = day. Collapsing is by (date + concept).

type Row = {
  mo: number;
  d: number;
  pf: string; // platform cell (may be multi: "IG · TikTok")
  pillar?: string;
  series?: string;
  concept: string;
  format?: string;
  hook?: string;
  caption?: string;
  visuals?: string; // Visuals column (links + notes)
  cta?: string;
  kw?: string; // ManyChat keyword (null when ManyChat=NO)
  kpi?: string;
  repurpose?: string;
  owner?: string;
  status?: string;
  assets?: string; // Final Assets column
};

const ROWS: Row[] = [
  // ===== JUNE =====
  { mo: 6, d: 1, pf: "Instagram", pillar: "Timely Travel", series: "Summer Unlocked Launch", concept: "Summer is here — the top 4 Wander homes for your best summer yet", format: "Reel", hook: "It's officially summer. These are the homes.", caption: "Cinematic B-roll montage of 5 summer properties: pool, deck, outdoor dining. Fast cuts, upbeat trending audio. Wander Surf City Shores · Ponte Vedra · Islamorada Beach · North Topsail Beach.", visuals: "https://drive.google.com/drive/folders/1I2B9n5LU-56PIqwvgx3c0byoEfdTf5Zc", cta: "Comment ESCAPE for the full summer collection", kw: "ESCAPE", kpi: "Reach + ManyChat triggers", repurpose: "TikTok, YouTube Shorts, Pinterest Pin", owner: "Silvina", status: "Posted", assets: "June 2026" },
  { mo: 6, d: 2, pf: "Instagram", pillar: "Travel Discovery", series: "Locals' Edit", concept: "The honest local's guide to Big Sur — things only Wander guests know", format: "Reel", hook: "Big Sur has a tourist version. This is the real one.", caption: "Slide 1: hook. Slides 2–7: local spot + one-line rec (restaurant, trail, hidden beach, coffee, bar, view). Slide 8: CTA. Minimal text, editorial aesthetic.", visuals: "https://drive.google.com/drive/folders/1-43OzV-ftPoVsu05BXertxQB8CImYQwG", cta: "Save this for your stay. Comment LOCAL for the property link.", kw: "LOCAL", kpi: "Saves + ManyChat triggers", repurpose: "TikTok, YouTube Shorts", owner: "Silvina", status: "Posted" },
  { mo: 6, d: 3, pf: "TikTok", pillar: "Entertainment", series: "POV Travel", concept: "POV: Your group chat finally agreed on a summer trip", format: "POV Reel, trending audio", hook: "POV: the group chat actually agreed for once.", caption: "Quick cuts of arriving at property, first reaction, pool, sunset, dining table full. Trending upbeat audio. Aspirational and joyful. (Cut the bikini frames.)", visuals: "https://drive.google.com/file/d/1157GZzsexgx_b35Az-Vno9mJUyzu6CWW/view", cta: "Tag your group chat ⬇️", kpi: "Reach + shares", repurpose: "Instagram Reel", owner: "Silvina", status: "Posted" },
  { mo: 6, d: 3, pf: "Pinterest", pillar: "Travel Discovery", series: "Summer Destinations", concept: "15 pins: best summer Wander destinations", format: "Animated carrousel", hook: "Luxury summer cabin rentals [destination]", caption: "Keyword-optimized pin titles: 'Luxury summer vacation rental Colorado,' 'Best beach cabin rentals,' etc. Property photos with text overlay.", cta: "Click for availability", kpi: "Impressions", repurpose: "Instagram and Pinterest", owner: "Silvina", status: "Posted", assets: "15 pins Pinterest: best summer Wander destinations" },
  { mo: 6, d: 4, pf: "Instagram", pillar: "Brand & Trust", series: "Guest Stories", concept: "A guest story after check out — what she said changed how we think about our homes", format: "Reel (brand-led)", hook: "They didn't just leave a review. They came back and told us the whole story.", caption: "Short cut of Tahoe Slopes customer story.", visuals: "https://drive.google.com/drive/folders/1rGzdyFPpCXJdXTa25JGqyHVAOkCIf1G3", cta: "Comment STANDARDS — I'll tell you our full checklist", kpi: "Comments + profile visits", repurpose: "Instagram, TikTok, YouTube Shorts", owner: "Silvina", status: "Posted" },
  { mo: 6, d: 5, pf: "Instagram / Pinterest", pillar: "Timely Travel", series: "Summer Boards", concept: "10 photos carrousel / 20 pins across 4 summer boards: beach, mountain, road trip, couples", format: "Animated Carrousel / Static Pins", hook: "Romantic summer cabin rental / Family summer vacation home", caption: "Batch-scheduled. Boards: 'Summer Vacation Rentals' / 'Luxury Summer Cabins' / 'Summer Road Trip Ideas' / 'Couples Summer Getaway'.", cta: "Book your summer escape", kpi: "Impressions / Pinterest saves + outbound clicks", owner: "Silvina", status: "Posted", assets: "June 5 - Animated Carrousel" },
  { mo: 6, d: 6, pf: "TikTok", pillar: "Travel Discovery", series: "Underrated Destinations", concept: "Why everyone is going to the Hamptons but smart travelers are going here instead", format: "Text over", hook: "Skip the Hamptons traffic. Here are 3 spots that no one's talking about.", caption: "Cape Cod – Chatham (no ferry, same lighthouses, half the price). Stowe, VT (greener, mountain biking, no billionaires). Black Mountain, NC (mountains + food + breweries). Named Wander homes in each.", visuals: "Cape Cod.mp4 / Stowe Hollow.mp4 / Wander Black Mountain Long Video Draft #2.mp4", cta: "Drop your state — I'll find you the underrated version", kpi: "Comments + saves", repurpose: "Instagram Reel, YouTube Shorts", owner: "Silvina", status: "Posted" },
  { mo: 6, d: 8, pf: "Instagram", pillar: "Travel Discovery", series: "48 Hours In…", concept: "48 hours in Jackson Hole in June (not just for hikers)", format: "Carousel (9 slides)", hook: "June in Jackson Hole is secretly the best time to go. Here's why.", caption: "Slide-by-slide itinerary. Mix of outdoor activities, restaurants, property shots. Actionable and specific. Strong save hook.", visuals: "https://drive.google.com/drive/folders/1tg1QursGHvTRsIacuS0l_A3V9D4DW9U6", cta: "Save this. Comment GUIDE for the property link.", kw: "GUIDE", kpi: "Saves + ManyChat", repurpose: "Pinterest board, TikTok video", owner: "Silvina", status: "Posted", assets: "Jackson Hole Carrousel" },
  { mo: 6, d: 10, pf: "TikTok", pillar: "Entertainment", series: "Remote Work Reset", concept: "Imagine working from a Wander home", format: "B-roll + text overlay", hook: "Work from home, they said. So I worked from here.", caption: "Phone-shot B-roll of desk setup, coffee, outdoor work setup, pool at 5pm. Text overlay. Wander Malibu Coast.", visuals: "https://drive.google.com/drive/folders/1WotHo5lQjaXYQzK8gWquJk5n-D0VTBd6", cta: "Comment WORK for our WFA-friendly homes", kw: "WORK", kpi: "Comments + ManyChat", repurpose: "Instagram Reel, YouTube Shorts", owner: "Silvina", status: "Posted" },
  { mo: 6, d: 12, pf: "Instagram", pillar: "Travel Discovery", series: "Locals' Edit", concept: "Where to eat, hike, and hide in Asheville this summer", format: "Carousel", hook: "Asheville in summer: the version tourists don't get.", caption: "8-slide carousel. Local restaurant, brewery, trail, market, art space, secret viewpoint, best time of day to visit each. Premium photography.", visuals: "https://drive.google.com/drive/folders/1Lz5aGPDy47kD1GK2luUXQyRBaq29K3sa  (can't mention the home — use as inspo on what to shoot)", cta: "Save + comment LOCAL for the nearest Wander home", kw: "LOCAL", kpi: "Saves", repurpose: "Pinterest board", owner: "Silvina", status: "Posted", assets: "June 12 Asheville Carrousel" },
  { mo: 6, d: 13, pf: "TikTok", pillar: "Timely Travel", series: "Summer Unlocked", concept: "Luxury cabin + outdoor pool in summer — this is what you're missing", format: "Cinematic B-roll + audio", hook: "Your summer plans are missing one thing. This.", caption: "Fast cuts: pool, deck, outdoor dining, fire pit at dusk. Trending summer audio. Pure aspiration. Short, punchy.", visuals: "https://drive.google.com/drive/folders/1WotHo5lQjaXYQzK8gWquJk5n-D0VTBd6", cta: "Link in bio — book your summer", kpi: "Reach + video views", repurpose: "Instagram Reel", owner: "Nibble", status: "Posted" },
  { mo: 6, d: 16, pf: "Instagram", concept: "PMI post", status: "Posted", assets: "PMI Post" },
  { mo: 6, d: 16, pf: "Pinterest", pillar: "Travel Discovery", series: "Itinerary Boards", concept: "6–10 pins: summer itineraries and destinations", format: "Static Pins", hook: "Summer weekend getaway — Colorado", caption: "Text-overlay pins linking to itinerary content.", cta: "Plan your trip →", kpi: "Impressions", status: "Planned" },
  { mo: 6, d: 17, pf: "Instagram", pillar: "Timely Travel", series: "Summer Unlocked", concept: "The summer homes that are still available (for now)", format: "Carousel + urgency", hook: "Still available this summer. For now.", caption: "Curated carousel of 5–6 properties with open summer dates. Real urgency. Links to booking. Check which homes are most searched/booked in June.", cta: "Comment ESCAPE before these go", kw: "ESCAPE", kpi: "ManyChat triggers + CTR", repurpose: "TikTok, Pinterest", owner: "Silvina", status: "Approved", assets: "June 17 - Still available this summer. For now." },
  { mo: 6, d: 17, pf: "TikTok", pillar: "Timely Travel", series: "Summer Unlocked", concept: "The summer homes that are still available (for now)", format: "Carousel + urgency", hook: "Still available this summer. For now.", caption: "Curated carousel of 5–6 properties with open summer dates. Real urgency. (Podemos probar y comentar manual.)", cta: "Comment ESCAPE before these go", kw: "ESCAPE", kpi: "ManyChat triggers + CTR", repurpose: "TikTok, Pinterest", owner: "Silvina", status: "Approved" },
  { mo: 6, d: 18, pf: "Pinterest", pillar: "Travel Discovery", series: "Summer Boards", concept: "6–8 pins: summer road trip content + local guides", format: "Mixed Pins", hook: "Luxury summer road trip / Best places to stay this summer", caption: "Hype properties for the summer across mixed pins.", cta: "Plan your summer →", kpi: "Impressions", status: "Planned" },
  { mo: 6, d: 19, pf: "Instagram", pillar: "Entertainment", series: "Worth the Drive", concept: "The Pacific Coast Highway route nobody has actually written down for you", format: "Reel + map overlay", hook: "The PCH road trip. The real version.", caption: "Dashboard B-roll + scenic cuts. Text overlay of the actual stops. Property reveal halfway through. Feels like a real trip plan.", visuals: "Claude inspiration: https://drive.google.com/file/d/1VM9oHD4HIdNDHg-o1i-QqS6WFmtp3HmH/view", cta: "Comment DRIVE for the route guide", kw: "DRIVE", kpi: "Saves + ManyChat", repurpose: "TikTok, YouTube Shorts, Pinterest", owner: "Silvina", status: "Planned" },
  { mo: 6, d: 21, pf: "TikTok", pillar: "Inspiration", series: "Seasonal Editorial", concept: "Summer solstice at a Montana cabin — the kind of trip people write about", format: "Cinematic Reel", hook: "The longest day of the year. Here's how to spend it.", caption: "Golden-hour B-roll. Sunset at 9:30pm. Deck, fire pit, stars. Ambient + emotional music. Solstice hook makes it timely and shareable. Big Sky, Montana.", visuals: "https://drive.google.com/drive/folders/11sMCoyIeURG1IyN8M7vxPuRf1T5Nix4O", cta: "Share this with who you want here", kpi: "Shares + reach", repurpose: "Instagram Reel, Pinterest", owner: "Silvina", status: "Approved", assets: "June 21 Summer Solstice.mov" },
  { mo: 6, d: 22, pf: "Instagram", pillar: "Inspiration", series: "Seasonal Editorial", concept: "June light in a Wander home in Vermont", format: "Reel, cinematic, no voiceover", hook: "June light. Vermont. You already know.", caption: "Slow editorial footage of a Vermont property in early summer. Natural light, linen, open windows. Ambient nature sounds. Minimal text.", visuals: "https://drive.google.com/drive/folders/1pNWEVoIjQBx91uss5aN3DPDAxWDXi0i3", cta: "Save for later. 📍 Vermont", kpi: "Saves + aesthetic reach", repurpose: "Pinterest Pin", owner: "Silvina", status: "Approved", assets: "June 14 Vermont.mov" },
  { mo: 6, d: 23, pf: "TikTok", pillar: "Travel Discovery", series: "48 Hours In…", concept: "Sonoma travel guide", format: "B-roll + Sarah's content", hook: "Nobody's telling you the truth about a weekend in wine country. Here it is.", caption: "Talking-head intro (host) + B-roll of local spots near property. Hour-by-hour breakdown. Feels like a friend's rec. Sonoma · Calistoga · Alexander Valley.", visuals: "https://drive.google.com/drive/folders/1cZvJhGfzbhuyeArtw6iLpXGh2j_G32a_  https://drive.google.com/drive/folders/1CSlrja8X_wL-DRvuMKmNd9AiOfIm9vF5", cta: "Comment GUIDE for the full itinerary", kw: "GUIDE", kpi: "Saves + search impressions", repurpose: "Instagram Reel, Pinterest board, YouTube Shorts", owner: "Silvina", status: "Approved", assets: "June 1 - Sonoma Travel Guide" },
  { mo: 6, d: 24, pf: "Instagram", pillar: "Timely Travel", series: "Summer Unlocked", concept: "July 4th is in 10 days — these homes are still open", format: "Reel (urgency-led)", hook: "10 days. A few homes left. You know what to do.", caption: "Countdown urgency. 3–4 property clips. Text overlay: dates available. Direct booking CTA. ManyChat for the link.", visuals: "Claude inspiration: https://drive.google.com/file/d/198kPHswERYhFzHd__WE8-IwT64f0kkmF/view", cta: "Comment ESCAPE for the link", kw: "ESCAPE", kpi: "ManyChat triggers + CTR", repurpose: "TikTok, Story", owner: "Silvina", status: "Planned" },
  { mo: 6, d: 25, pf: "TikTok", pillar: "Travel Discovery", series: "Underrated Destinations", concept: "The New England town nobody is talking about this summer", format: "Talking head", hook: "Everyone's going to Newport. Here's where I'd go instead.", caption: "Host makes a specific, confident rec for an underrated NE town near a Wander property. Names, context, why it's better right now. Cuttyhunk, Massachusetts.", visuals: "https://drive.google.com/drive/folders/1fvke33HleAjRxelogYLXdrRuSv2A7ypz", cta: "Drop your nearest city — I'll find the underrated version", kpi: "Comments + saves", repurpose: "Instagram Reel", owner: "Silvina", status: "Approved", assets: "June 25 - Underrated Destinations 2" },
  { mo: 6, d: 26, pf: "Instagram", pillar: "Entertainment", series: "Guest Stories", concept: "The couples trip that almost got cancelled — and why they're so glad it didn't", format: "Reel", hook: "They almost said no. Here's what they almost missed.", caption: "Guest footage from a stay. Real moments: dining, laughing, outdoor activity. Text overlay tells the story arc. Emotional and shareable.", visuals: "https://drive.google.com/drive/folders/1_qK3mAcvARhMxhidfIlaAOLAAfKuuwSg", cta: "Tag your group", kpi: "Shares + reach", repurpose: "TikTok", owner: "Silvina", status: "Approved", assets: "Copy of June 26 Guest Stories.mov" },
  { mo: 6, d: 27, pf: "TikTok", pillar: "Entertainment", series: "POV Travel", concept: "POV: You upgraded your summer plans at the last minute", format: "POV Reel, trending audio", hook: "POV: You said yes to the good option.", caption: "Arrival-at-property reveal. Wide shot, reaction energy. Trending audio. Fast cuts. Ends with poolside scene. Pure entertainment.", visuals: "https://drive.google.com/file/d/1M18UrQCxcp4GgJ2GUU_tIhcoCNYW_HeB/view", cta: "Which property is your upgrade? Drop a 🏔 or 🌊", kpi: "Reach + shares", repurpose: "Instagram Reel", owner: "Silvina", status: "Approved", assets: "June 13 - Lakebomoseen.mov" },
  { mo: 6, d: 28, pf: "Instagram", pillar: "Inspiration", series: "Property Showcase", concept: "Morning at Kona Bay", format: "Reel, cinematic", hook: "There's a version of your morning that looks like this. Kailua-Kona, Hawaii.", caption: "Re-use nibble content.", visuals: "https://drive.google.com/drive/folders/1-MKLtMeAk-xOhtBdkFGcfjJCFoGEyOSP", cta: "Save for your next summer escape", kpi: "Reach + saves", repurpose: "Pinterest Pin, TikTok", owner: "Nibble", status: "Approved" },
  { mo: 6, d: 29, pf: "TikTok", pillar: "Timely Travel", series: "Summer Unlocked", concept: "Summer in Texas hits completely different", format: "Cinematic Reel + trending audio", hook: "Texas in summer is the best-kept secret in luxury travel.", caption: "Cinematic B-roll: rivers, mountains, cabin deck at golden hour. Trending summer audio. Simple text overlay. No voiceover needed.", visuals: "https://drive.google.com/file/d/1bnsTbVZQ2rDJu0XwjWJq_rk8465v2ZvA/view", cta: "Comment ESCAPE for the property", kw: "ESCAPE", kpi: "Reach + video views", repurpose: "Instagram Reel, YouTube Shorts", owner: "Silvina", status: "Approved", assets: "June 4 - Tiktok Texas.mov" },
  { mo: 6, d: 29, pf: "Pinterest", pillar: "Timely Travel", series: "Holiday Boards", concept: "20 pins: July 4th and summer holiday content", format: "Static + Idea Pins", hook: "July 4th vacation rental / Luxury 4th of July cabin", caption: "Batch-published. Holiday board: 'July 4th Weekend Getaway' + 'Luxury 4th of July'.", cta: "Book your holiday escape →", kpi: "Impressions", status: "Planned" },
  { mo: 6, d: 30, pf: "", series: "Inspiration", concept: "Tetons are calling", owner: "Silvina", status: "Approved", assets: "Tetons1.mov" },
  { mo: 6, d: 30, pf: "YouTube Shorts", pillar: "Travel Discovery", series: "Shorts Repurpose", concept: "Repurpose top 4 June TikToks to YouTube Shorts", format: "YouTube Shorts", hook: "Already produced", caption: "Remove TikTok watermarks. Add YouTube-optimized titles and descriptions with keywords.", cta: "Subscribe for weekly luxury travel guides", kpi: "YouTube views + subscribers", repurpose: "—", status: "Planned" },

  // ===== JULY =====
  { mo: 7, d: 4, pf: "IG · TikTok", pillar: "Timely Travel", concept: "Where to watch the fireworks — the best spots near a Wander 🎆", format: "Carousel", hook: "If you're near a Wander this 4th of July, here's where to watch the fireworks 🎆", caption: "Best spots by location: FL (30A — Baytowne, Destin), Austin TX (Auditorium Shores, Zilker), TN (Sevierville Patriot Festival, Gatlinburg), NC (Asheville Memorial Stadium, Lake Julian), CA (Santa Barbara, Malibu Pier). Each slide: city, best spot, distance from nearest Wander. Save-optimized.", cta: "Comment ESCAPE for the nearest Wander to your fireworks 🇺🇸", kw: "ESCAPE", kpi: "Saves + ManyChat", repurpose: "Static, Story", status: "Planned" },
  { mo: 7, d: 6, pf: "Instagram", pillar: "Travel Discovery", series: "Locals' Edit", concept: "Where locals go near our Big Sky, Montana property", format: "Carousel", hook: "Montana locals don't go where tourists go. Here's their list.", caption: "8 slides: local bar, hiking trail not on Google, farmer's market, best BBQ, swimming hole, coffee, viewpoint. Premium photography.", cta: "Save + comment LOCAL", kw: "LOCAL", kpi: "Saves", status: "Planned" },
  { mo: 7, d: 7, pf: "TikTok", pillar: "Travel Discovery", series: "48 Hours In…", concept: "Sonoma restaurants", format: "B-roll + Sarah's content", hook: "Nobody's telling you the truth about a weekend in wine country. Here it is.", caption: "Talking-head intro (host) + B-roll of local spots near property. Hour-by-hour. Sonoma · Calistoga · Alexander Valley.", visuals: "https://drive.google.com/drive/folders/1cZvJhGfzbhuyeArtw6iLpXGh2j_G32a_", cta: "Comment GUIDE for the full itinerary", kw: "GUIDE", kpi: "Saves + search impressions", repurpose: "Instagram Reel, Pinterest board, YouTube Shorts", owner: "Silvina", status: "Approved", assets: "June 1 - Sonoma Restaurants" },
  { mo: 7, d: 8, pf: "IG · TikTok", pillar: "Travel Discovery", series: "Locals' Edit", concept: "Golf + Wander — the best courses near our properties this summer ⛳", format: "Animated Carousel", hook: "Vacation golf hits different when you wake up to this view ⛳", caption: "Golf weekend guide (perfect July weather): Santa Rosa Hammock (30A) → Shark's Tooth; Broken Bow Timber (OK) → Cedar Creek; Nashville Buena Vista → The Grove. Each slide: course, best time to book, insider tip. Audience: groups 35–55.", cta: "Comment GOLF for our summer golf weekend Wander guide ⛳", kw: "GOLF", kpi: "Saves + profile visits", status: "Planned" },
  { mo: 7, d: 8, pf: "Instagram", pillar: "Travel Discovery", series: "48 Hours In…", concept: "48 hours in 30A, the exact itinerary", format: "Carousel", hook: "The 30A weekend you've been looking for.", caption: "Hour-by-hour. Local spots, property features, outdoor activities. Maps. Save-optimized.", cta: "Save this. Comment GUIDE.", kw: "GUIDE", kpi: "Saves + ManyChat", repurpose: "TikTok", status: "Planned" },
  { mo: 7, d: 9, pf: "TikTok", pillar: "Timely Travel", series: "Peak Summer", concept: "Late July is when smart travelers book August", format: "B-roll", hook: "If you're watching this in July, book your August trip today.", caption: "Direct camera: urgency, specific. 'August books out in July. These 3 homes are still open.' Shows properties. Specific dates.", cta: "Comment ESCAPE for availability", kw: "ESCAPE", kpi: "ManyChat triggers", repurpose: "Instagram Story, Instagram Reel", status: "Planned" },
  { mo: 7, d: 10, pf: "Instagram", pillar: "Brand & Trust", series: "Customer Stories", concept: "Anchor Bay customer stories", format: "Reel", caption: "Anchor Bay customer stories.", owner: "Silvina", status: "Approved", assets: "Anchor Bay Clip 1 with subs.mov" },
  { mo: 7, d: 12, pf: "TikTok", pillar: "Travel Discovery", series: "Worth the Drive", concept: "The 3-hour drive from NYC that changes everything", format: "Reel", hook: "3 hours from NYC. A completely different world.", caption: "Dashboard POV from NYC, Route 9 north, arrival in Hudson Valley. Property reveal. Narrated. Feels like a real adventure.", cta: "Comment DRIVE for the route", kw: "DRIVE", kpi: "Saves + ManyChat", repurpose: "Instagram Reel, YouTube Shorts", status: "Planned" },
  { mo: 7, d: 13, pf: "Instagram", pillar: "Brand & Trust", series: "Remote Work Reset", concept: "The home office setup at our Smoky Mountains property is making us rethink WFH", format: "Reel", hook: "Okay but why does this office hit different.", caption: "Desk setup reveal at Smoky Vista (TN): mountain view through floor-to-ceiling windows, outdoor lunch on the deck, hot tub at 5pm. All B-roll, no talking head. Caption: 'out of office should mean this'.", cta: "Comment WORK for WFA-friendly Wanders", kw: "WORK", kpi: "Saves + ManyChat", repurpose: "TikTok", status: "Planned" },
  { mo: 7, d: 14, pf: "Instagram", pillar: "Inspiration", series: "The views", concept: "The views — Yosemite Valley", format: "Reel", caption: "Cinematic views — Yosemite Valley.", repurpose: "TikTok", owner: "Silvina", status: "Approved", assets: "The views - Yosemite Valley .mov" },
  { mo: 7, d: 15, pf: "Instagram", pillar: "Brand & Trust", series: "Customer Stories", concept: "Bandon Beach customer stories", format: "Reel", caption: "Bandon Beach customer stories.", owner: "Silvina", status: "Approved", assets: "Bandon Beach Clip with subs.mov" },
  { mo: 7, d: 17, pf: "TikTok", pillar: "Timely Travel", series: "Peak Summer", concept: "August is 2 weeks away — here's what's still open this summer", format: "Animated Carousel", hook: "Last-minute opportunities.", caption: "Animated carousel urgency: 3–4 properties with real August availability. Each slide: property, open dates, price/night. Last slide: 'Last chance to book summer 2026'. Existing B-roll + text overlays. No talking head.", cta: "Comment ESCAPE for availability links 🔥", kw: "ESCAPE", kpi: "ManyChat conversions", repurpose: "Story, Static", status: "Planned" },
  { mo: 7, d: 18, pf: "Instagram", pillar: "Insider Community", series: "UGC Feature", concept: "We asked our guests for their best Wander photo — here are the top 5", format: "Carousel", hook: "You asked. We delivered. These are your photos.", caption: "Guest-submitted photos, crediting each. Real guests in real properties. Social proof.", cta: "Tag your Wander photos for a chance to be featured", kpi: "Engagement + community", status: "Planned" },
  { mo: 7, d: 19, pf: "IG · TikTok", pillar: "Travel Discovery", series: "Road Trip", concept: "3 Wanders, one road trip 🚗 Nashville → Smoky Mountains → 30A", format: "Animated Carousel", hook: "This is the ultimate summer road trip in the South — and it ends at the beach 🚗🌊", caption: "3 Wanders, one route: Nashville Buena Vista (Lower Broadway) → Smoky Vista in Sevierville TN (mountain + trails + hot tub) → Santa Rosa Hammock in 30A (beach + golf cart). Real distances, best stops, what to do at each.", cta: "Comment ROADTRIP for the 3-stop Wander itinerary 🗺️", kw: "ROADTRIP", kpi: "Saves + ManyChat", repurpose: "YouTube Shorts, Pinterest", status: "Planned" },
  { mo: 7, d: 20, pf: "Instagram", pillar: "Travel Discovery", series: "48 Hours In…", concept: "48 hours in the Hamptons — what to do when you're not at the house", format: "Animated Carousel", hook: "The Hamptons have everything. Here's how to use it in 48 hours.", caption: "Property + surrounding activities. Watersports, hiking, dining, sunsets. Save-optimized.", cta: "Save + comment GUIDE", kw: "GUIDE", kpi: "Saves", repurpose: "TikTok", status: "Planned" },
  { mo: 7, d: 21, pf: "TikTok", pillar: "Brand & Trust", series: "Wander vs. The World", concept: "What guests actually say after their first Wander stay — in their own words", format: "Animated Carousel", hook: "We didn't write these. Our guests did.", caption: "Carousel of real guest reviews: each slide = one review with text + a soft property photo. Source: Google, TripAdvisor, wander.com. Pick 5–6 of the most specific, emotional reviews.", cta: "Tap to see more guest reviews →", kpi: "Saves + trust", repurpose: "Story, Static", status: "Planned" },
  { mo: 7, d: 22, pf: "Instagram", pillar: "Entertainment", series: "Worth the Drive", concept: "The best amusement parks near a Wander home 🎢", format: "Animated Carousel", hook: "Didn't know a Wander home and a theme park could be the same trip 🎢", caption: "Carousel: Dollywood (Smoky Vista, 15 min) · Six Flags Fiesta Texas (San Antonio) · Busch Gardens Tampa · Universal/Disney Orlando · Knott's Berry Farm (Southern CA).", cta: "Comment PARKS for the nearest Wander to your park 🎢", kw: "PARKS", kpi: "Saves + ManyChat", repurpose: "TikTok", status: "Planned" },
  { mo: 7, d: 24, pf: "IG · TikTok", pillar: "Timely Travel", series: "Last-Minute Getaway", concept: "Last-minute getaway this weekend — what to actually do once you're there", format: "Animated Carousel", hook: "You booked last-minute. Now what? Here's exactly what to do 🏖️", caption: "Practical guide: what to book on arrival, where to eat without a reservation, the activity that never fails. Anchored in 30A (Gulf Shores / Santa Rosa Hammock). Useful, fast, no stress. Save-optimized.", cta: "Comment LASTMINUTE for the weekend playbook 📋", kw: "LASTMINUTE", kpi: "Saves + ManyChat", repurpose: "TikTok, Story", status: "Planned" },
  { mo: 7, d: 24, pf: "TikTok", pillar: "Travel Discovery", series: "Underrated Destinations", concept: "Sarah's 30A travel guide — the local version no blog has", format: "Animated Carousel", hook: "This travel guide from our 30A host is better than anything on Google 🌊", caption: "Cut from Sarah's 30A travel guide (Panama City / 30A area).", cta: "Comment 30A for Sarah's full guide + our 30A Wanders 🌊", kw: "30A", kpi: "Saves + ManyChat", repurpose: "TikTok", status: "Planned" },
  { mo: 7, d: 25, pf: "Instagram", pillar: "Inspiration", series: "The views", concept: "My type of peace — Austin Falling Leaves", format: "Reel", caption: "Cinematic peace — Austin Falling Leaves.", cta: "Comment ESCAPE — first to know gets first pick", kw: "ESCAPE", kpi: "ManyChat opt-ins + reach", repurpose: "TikTok", owner: "Silvina", status: "Approved", assets: "My Type of Peace - Austin Falling Leaves.MOV" },
  { mo: 7, d: 26, pf: "IG · TikTok", pillar: "Travel Discovery", series: "What to do in X", concept: "Trekking guide — best trekking roads for the summer", format: "Animated Carousel", hook: "You don't need to travel far. The best hikes start 10 minutes from these Wanders 🥾", caption: "Great Smoky Mountains (Alum Cave Trail, 4.4mi, moderate), Beavers Bend (Cedar Creek Trail), Blue Ridge Parkway (Tanawha Trail). Each slide: trail, difficulty, duration, what to see.", cta: "Comment TREK for the full trails guide 🥾", kw: "TREK", kpi: "Saves + search", repurpose: "YouTube Shorts", status: "Planned" },
  { mo: 7, d: 27, pf: "YouTube Shorts", pillar: "Travel Discovery", series: "Shorts Repurpose", concept: "Repurpose top 4 July TikToks to YouTube Shorts", format: "YouTube Shorts", hook: "Already produced", caption: "Remove watermarks. Optimize titles for YouTube search. Target: 'road trip wander homes' / 'summer vacation rental ideas'.", cta: "Subscribe for weekly luxury travel content", kpi: "YouTube views", status: "Planned" },
  { mo: 7, d: 29, pf: "IG · TikTok", pillar: "Travel Discovery", series: "What to do in X", concept: "National Parks near Wander — base camp de lujo este verano", format: "Animated Carousel", hook: "These national parks hit different when you have a Wander 5 minutes away 🏕️", caption: "Great Smoky Mountains (arrive before 9am, fireflies in July) · Beavers Bend / Broken Bow (kayak at sunrise) · Shenandoah / Blue Ridge (Old Rag, timed entry 30 days out). Each slide: park + nearest Wander + best trail + local tip.", cta: "Comment PARKS for our National Parks Wander guide 🏕️", kw: "PARKS", kpi: "Saves + search", repurpose: "YouTube Shorts", status: "Planned" },
  { mo: 7, d: 30, pf: "Instagram", pillar: "Travel Discovery", series: "Locals' Edit", concept: "The honest guide to what to do near our Malibu property", format: "Carousel", hook: "Malibu has a tourist version. Here's the real one.", caption: "Local spots: hidden beach, breakfast spot, best hike, wine bar, surf lesson, sunset point. 8 slides. Specific addresses.", cta: "Save + comment LOCAL", kw: "LOCAL", kpi: "Saves", status: "Planned" },
  { mo: 7, d: 31, pf: "IG · TikTok", pillar: "Travel Discovery", series: "Travel Guides", concept: "Wander has built-in travel guides — and they're better than any blog 🗺️", format: "Animated Carousel", hook: "Every Wander property comes with a built-in local guide. Here are the best ones this summer.", caption: "Wander embeds curated travel guides on each property page. Best of summer: 30A (Santa Rosa Hammock — The Red Bar, Café Thirty-A, Bud & Alley's), Smoky Mountains (Smoky Vista), Nashville (Buena Vista). Show the site section + best picks.", cta: "Comment GUIDES and we'll send you our summer travel guides 🗺️", kw: "GUIDES", kpi: "Saves + web traffic", repurpose: "YouTube Short", status: "Planned" },
  { mo: 7, d: 31, pf: "Instagram", pillar: "Insider Community", series: "Fall Teaser", concept: "We're planning our fall collection — which do you want first?", format: "Story (5 slides)", hook: "Fall is coming. You pick what we drop first. 🍂", caption: "Poll story 1: Vermont foliage vs. Colorado Springs mountain. Poll story 2: October or November. Drives fall booking intent early. Colorado Springs → Wander Pikes Peak.", cta: "Vote now", kpi: "Story poll votes", status: "Planned" },
];

// ---- RUN ------------------------------------------------------------------

async function main() {
  console.log(`Importing ${ROWS.length} sheet rows → collapsed ideas…`);

  // 1) Clear prior import + kill existing Wander series (signed off).
  await db
    .delete(platformPostTable)
    .where(sql`${platformPostTable.metadata} ->> 'importSource' = ${MARKER}`);
  await db
    .delete(contentPostTable)
    .where(sql`${contentPostTable.metadata} ->> 'importSource' = ${MARKER}`);
  const killed = await db
    .delete(seriesTable)
    .where(eq(seriesTable.brandId, WANDER_BRAND_ID))
    .returning({ id: seriesTable.id });
  console.log(`  cleared prior import · dropped ${killed.length} existing series`);

  // 2) Seed series from the Series column (the team's own taxonomy).
  const seriesNames = [
    ...new Set(
      ROWS.map((r) => r.series && normaliseSeries(r.series))
        .filter((s): s is string => !!s),
    ),
  ].sort();
  const seriesId = new Map<string, string>();
  for (let i = 0; i < seriesNames.length; i++) {
    const name = seriesNames[i]!;
    const [row] = await db
      .insert(seriesTable)
      .values({
        brandId: WANDER_BRAND_ID,
        name,
        status: "active",
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      })
      .returning({ id: seriesTable.id });
    if (row) seriesId.set(name, row.id);
  }
  console.log(`  seeded ${seriesId.size} series`);

  // 3) Collapse rows by (date + concept) → one idea, with union of platforms.
  const groups = new Map<string, Row[]>();
  for (const r of ROWS) {
    const key = `${r.mo}-${r.d}-${r.concept.toLowerCase().trim()}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  let ideaCount = 0;
  let spotCount = 0;

  for (const group of groups.values()) {
    const lead = group[0]!;
    const date = new Date(2026, lead.mo - 1, lead.d, 12, 0, 0);
    const status = mapStatus(lead.status ?? "");
    const pillarSlug = lead.pillar ? PILLARS[lead.pillar.toLowerCase()] ?? null : null;
    const seriesKey = lead.series ? normaliseSeries(lead.series) : null;

    const ownerKey = (lead.owner ?? "").toLowerCase();
    const ownerId = ownerKey in OWNERS ? OWNERS[ownerKey] : null;

    const ctaKeyword = lead.kw?.trim() || null;

    // Idea-level brief (written once, inherited by every spot).
    const [idea] = await db
      .insert(contentPostTable)
      .values({
        brandId: WANDER_BRAND_ID,
        seriesId: seriesKey ? (seriesId.get(seriesKey) ?? null) : null,
        ownerId,
        title: lead.concept,
        pillar: pillarSlug,
        plannedAt: date,
        status,
        origin: "human",
        hook: lead.hook ?? null,
        captionDirection: lead.caption ?? null,
        visualDirection: stripUrls(lead.visuals) || null,
        ctaText: lead.cta ?? null,
        ctaKeyword,
        kpi: lead.kpi ?? null,
        metadata: {
          importSource: MARKER,
          repurposeTo: lead.repurpose ?? null,
          finalAssets: lead.assets ?? null,
          ownerName: lead.owner ?? null,
        },
      })
      .returning({ id: contentPostTable.id });
    if (!idea) continue;
    ideaCount++;

    // One spot per platform across the grouped rows (de-duped by platform).
    const spotForPlatform = new Map<Platform, Row>();
    for (const r of group) {
      const platforms = parsePlatforms(r.pf);
      for (const pf of platforms) if (!spotForPlatform.has(pf)) spotForPlatform.set(pf, r);
    }

    for (const [pf, r] of spotForPlatform) {
      const { format, archetype, template } = mapFormat(pf, r.format ?? "");
      const links = extractUrls(r.visuals, r.assets);
      await db.insert(platformPostTable).values({
        brandId: WANDER_BRAND_ID,
        contentPostId: idea.id,
        platform: pf,
        format,
        archetype,
        template,
        source: "owned",
        status,
        origin: "human",
        ownerId,
        assetLinks: links.length ? links : null,
        publishedAt: status === "published" ? date : null,
        scheduledAt: status === "published" ? null : date,
        metadata: { importSource: MARKER },
      });
      spotCount++;
    }
  }

  console.log(`Done. ${ideaCount} ideas · ${spotCount} platform spots.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
