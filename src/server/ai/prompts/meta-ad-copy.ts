/**
 * How the words around a Meta ad are written: the primary text, headline and
 * description. One source for the ad-set builder and starter ideas, so every
 * path writes in the shape the team's ads that ran use.
 *
 * Built from the account's history (2026-09 read of every Meta ad Wander ran):
 * the examples are real ads, chosen for the shape and voice to aim for, not
 * rules against bad copy. Their facts belong to those homes, never to the one
 * being written.
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
1. A hook of about 60 characters or fewer that names the place and the one thing that sets this home apart, ending with one emoji that fits the setting. It is a picture or a moment, never a room count: "Escape to riverfront luxury in Winter Park 🏔️", "Wake up surrounded by glass, nature, and Sonoma's rolling hills 🍷". A question that names the guest's plan works too: "Planning a Tahoe trip with friends or family?"
2. Four to six bullets, each an emoji and one thing a guest books for with its concrete detail ("♨️ Private rooftop hot tub with mountain views", "🏊 Private pool, Memorial Day to Labor Day"). The feature only this home has goes near the top; "+" joins two ideas.
3. The facts bullet: "🛏️ 5 bedrooms · 5 bathrooms · Sleeps 18".
4. One sentence on who the home is for and what a stay feels like, in the listing's own terms. A nearby landmark with its real distance is a strong way to end it ("two miles from Old Man's Cave").
5. A short closing line: "Your Sonoma escape awaits." or "Book direct with <brand>."
About 350 to 500 characters in all. When the brand's voice is plain rather than emoji-led, two calm sentences do the same job: "Plan your Panama City Beach stay that truly feels relaxing. Enjoy a private home with a pool, full kitchen, and space to gather, perfect for slow mornings and effortless beach days."

Home ads that ran, for shape and voice only (their facts are not this home's):
${HOME_EXAMPLES.map((example) => `---\n${example}`).join("\n")}
---`;

/** The primary text for a set of homes: a portfolio carousel or the catalog. */
export const META_COLLECTION_CAPTION = `Open on the collection as a whole, with its count or its place ("Four homes, four ways to experience Sonoma Wine Country." or "Your next mountain escape starts here 🏔️"). With eight homes or fewer, give each home one bullet of its own, its name then its one angle: "🏡 R&R Ranch: your own private retreat, with a pool made for slow mornings and golden evenings". With more, four or five bullets that are true of most of them. Then one sentence naming the trips the homes suit ("Whether you're planning a family escape, a ski trip with friends, or a long weekend in the mountains, find a home made for unforgettable stays.") and an invitation to explore: "Explore the collection and find your perfect Wine Country getaway."`;

/** The bold line under the image. */
export const META_HEADLINE = `The headline sits under the image in bold and is often read before the caption: 20 to 40 characters, sentence case, one idea, no emoji. It says what the caption's first line does not: what the stay offers, who it is for, or a proof point. Headlines from ads that ran: "Room for 18 in the Hocking Hills woods", "A log cabin with its own sauna", "Your private beach house awaits", "Vacation rentals built for groups", "Book your last-minute weekend escape", "Secure your 2026 escape". For a collection, name what the homes share or what the guest gets, never "Homes in <place>".`;

/** Meta's grey line under the headline. */
export const META_DESCRIPTION = `The description is Meta's grey line under the headline, at most 60 characters, no emoji, never repeating the headline. For a home, the facts a guest compares on, separated by " · ": "6 bedrooms · Sleeps 18 · Private pool". For a collection, what the set offers together: "8 homes · Sleep up to 22". For a brand ad, one proof point the brand really has: "24/7 concierge service".`;

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
