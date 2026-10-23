/**
 * How the words around a Meta ad are written: the primary text, headline and
 * description. One source for the ad-set builder and starter ideas, so every
 * path writes in the shape the team's ads that ran use.
 *
 * Built from the account's history (2026-09 read of every Meta ad Wander ran)
 * and the performance team's Chalets in Hocking Hills copy (2026-09): the
 * examples are real ads, chosen for the shape and voice to aim for, not rules
 * against bad copy. Their facts belong to those homes, never to the one being
 * written. Repeating a good line across a brand's ads is the house style for
 * now; varied copy was coming out weaker, not better.
 */

const HOME_EXAMPLES = [
  `Escape to riverfront luxury in Winter Park 🏔️

🌊 Private riverfront setting with mountain views
♨️ Hot tub
🔥 Rooftop deck with fire pit + outdoor living
🎬 Home theater + arcade + game room
🧖 Steam room + outdoor sauna
🛏️ 5 bedrooms · 5 bathrooms · Sleeps 18

With over 5,000 square feet of space, a custom bunk room, multiple gathering areas, and room for the whole crew, this one-of-a-kind mountain mansion is made for unforgettable group getaways.

Your next mountain adventure awaits.`,
  `Your private cabin surrounded by nature 🌲

🏡 Rustic log cabin set on 12 private acres
💧 Scenic stream + peaceful wilderness setting
🔥 Wood-burning fireplace for cozy nights in
🛁 Large outdoor hot tub + fire pit
🥾 Close to Conkles Hollow, rock climbing + bridle trails
🛏️ 3 bedrooms · 2 baths · Sleeps 8

Spend your days exploring Hocking Hills, then come home to your own private cabin for a soak in the hot tub, dinner by the fire, and a night surrounded by the woods.

Your Hocking Hills getaway awaits.`,
  `Your private modern retreat in Hocking Hills 🌲

🏡 Modern mountain chalet tucked into a wooded hillside
🪟 Walls of windows with peaceful forest views
🔥 Gas fireplace + private fire pit
🛁 Private hot tub + shower built for two
🌿 Secluded setting for a quiet escape
🛏️ 1 bedroom · 1 bath · Sleeps 2

The perfect escape for two. Spend the day exploring Hocking Hills, then come home to your own private chalet for a hot tub soak, a cozy night by the fire, and a little time away from it all.

Your Hocking Hills getaway awaits.`,
  `A private vineyard, a working ranch, and your own slice of Wine Country 🍇

🏡 Sprawling ranch estate surrounded by vineyards
🍷 Estate-grown Cabernet + private wine tastings
🐴 Horses, cows, chickens + peacocks on the property
🏊 Two private pools surrounded by nature
🛏️ 7 bedrooms · 5 bathrooms · Sleeps 14

Wander through the vines, meet the animals, or sip a glass of Cabernet grown right here on the estate. With plenty of space to gather and unwind, this is a Wine Country escape unlike any other.

Your unforgettable Sonoma getaway awaits.`,
  `Trade crowded resorts for your own private beachfront retreat.

☀️ Private pool
🌊 Steps from the beach
🍹 Rooftop hot tub + wet bar
🌅 Panoramic ocean views

Whether you're planning a family vacation, friends getaway, or special celebration, this North Topsail Beach home was designed for unforgettable summer memories.

Book your stay before peak summer dates are gone.`,
] as const;

/** The primary text for one home. */
export const META_HOME_CAPTION = `Write the primary text the way the team's home ads that ran are written, each part on its own line with a blank line between the parts:
1. A hook of about 60 characters or fewer: the kind of stay and what sets it apart, often with the place, ending with one emoji that fits the setting. It is a picture or a moment, never a room count: "Your private cabin surrounded by nature 🌲", "A grand escape in the heart of Hocking Hills 🌲", "Wake up to the sound of a seasonal waterfall 💧", "Escape to riverfront luxury in Winter Park 🏔️". A question that names the guest's plan works too: "Planning a Tahoe trip with friends or family? 🏔️"
2. Four to six bullets, each an emoji and one thing a guest books for with its concrete detail. The first says what the home is and where it sits ("🏡 Rustic log cabin set on 12 private acres"); then the draws, the feature only this home has near the top, "+" joining two ideas ("🛁 Large outdoor hot tub + fire pit", "🔥 Cozy fireplaces + inviting gathering spaces"). When the listing names nearby parks, trails or sights, one bullet names them ("🥾 Close to Old Man's Cave + scenic hiking trails"); a distance only when the listing states it.
3. The facts bullet, last: "🛏️ 6 bedrooms · 3.5 baths · Sleeps 18".
4. One or two sentences on the stay, in the listing's own terms: the day out, then coming home to this home ("Spend your days exploring Hocking Hills, then come home to your own private cabin for a soak in the hot tub, dinner by the fire, and a night surrounded by the woods."). Name who it suits when the home makes that clear ("The perfect escape for two.", "Bring the whole crew").
5. A short closing line: "Your Hocking Hills getaway awaits." or "Book direct with <brand>."
About 350 to 550 characters in all.

Repeating is fine across a brand's ads: the same hook emoji, the same "spend your days ..., then come home to ..." sentence shape and the same closing line on every home is how the team writes a campaign. Make each home's bullets its own; reuse the rest rather than straining for a new phrasing. Use this emoji-led structure consistently for home and collection ads across the brand, including rewrites. A plain caption is allowed only when the operator or saved brand copy guidance explicitly requests no emojis; never infer that exception from an older ad or a general voice description. In that explicit plain-caption mode, two calm sentences do the same job: "Plan your Panama City Beach stay that truly feels relaxing. Enjoy a private home with a pool, full kitchen, and space to gather, perfect for slow mornings and effortless beach days."

Home ads that ran, for shape and voice only (their facts are not this home's):
${HOME_EXAMPLES.map((example) => `---\n${example}`).join("\n")}
---`;

/** The primary text for a set of homes: a portfolio carousel or the catalog. */
export const META_COLLECTION_CAPTION = `Open on the collection as a whole, with its place and the same emoji the home ads use ("Your next Hocking Hills getaway starts here 🌲" or "Four homes, four ways to experience Sonoma Wine Country 🍇"). Keep the same caption style as the brand's home ads, including rewrites: one setting emoji at the end of the hook and one emoji at the start of each bullet. Use a plain caption only when the operator or saved brand copy guidance explicitly requests no emojis. Then four to six bullets true of most of the homes, emoji-led like the home ads ("🔥 Cozy fireplaces + outdoor fire pits", "🥾 Minutes from hiking trails, waterfalls + Hocking Hills' best outdoor adventures", "👨‍👩‍👧‍👦 Options for cozy getaways for two or group escapes with everyone"). Then one sentence naming the trips the homes suit ("Whether you're planning a romantic weekend, a family adventure, or a getaway with friends, find a private home that gives you room to relax, reconnect, and enjoy Hocking Hills your way.") and an invitation to explore: "Explore the collection and find your perfect escape." The portfolio carousel and the catalog ad can carry the same caption.`;

/** The bold line under the image. */
export const META_HEADLINE = `The headline sits under the image in bold and is often read before the caption: 20 to 40 characters, one idea, no emoji, never the caption's first line word for word. The simple default is what the stay is and where, and one headline can run on every ad in a campaign: "Cabin rentals in Hocking Hills". Other headlines from ads that ran: "Room for 18 in the Hocking Hills woods", "A log cabin with its own sauna", "Your private beach house awaits", "Vacation rentals built for groups", "Book your last-minute weekend escape", "Secure your 2026 escape". For a collection, name what the homes share or what the guest gets, never "Homes in <place>".`;

/** Meta's grey line under the headline. */
export const META_DESCRIPTION = `The description is Meta's grey line under the headline. Many placements hide it, so keep it plain: at most 60 characters, no emoji, not the headline again. For a home, its facts separated by " · ": "6 bedrooms · Sleeps 18". For a collection, what the set offers together: "8 homes · Sleep up to 22". For a brand ad, one proof point the brand really has: "24/7 concierge service".`;

/** A brand-level concept with no homes chosen yet. */
export const META_BRAND_CONCEPT = `A brand concept opens with one claim a guest can feel, in one short sentence, backs it with proof the brand really has, then invites: two or three short paragraphs, 150 to 300 characters. Brand ads that performed, for shape only:
---
Curated vacation homes in extraordinary places, with everything handled.

90%+ guest satisfaction. Stay once, and you'll see why. Explore Wander homes.
---
You're not just booking a vacation home.

You're getting hotel-level quality, 24/7 concierge service, and beautifully designed homes in incredible places.

That's the Wander difference.
---
Urgency needs a real reason (a season, a dated offer the brand confirmed); without one, leave it out.`;
