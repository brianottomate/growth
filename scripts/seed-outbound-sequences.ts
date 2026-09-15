/**
 * Seed the WanderOS cold-outbound A/B/C sequence test into the DB (intent layer).
 *
 * Three parallel lifecycle programs, all driving to wander.com/os:
 *   A · Reply-first (text only)          — pure-deliverability control, CTA = reply
 *   B · Self-serve (text + /os link)     — one plain UTM'd /os link, link-tracking OFF
 *   C · Visual (text + link + image)     — boss's variant; we want the data on it
 *
 * Sender identity is a single SENDER constant — start as Kristian (pretend supply
 * rep), flip to James Caswell later and re-run; the script is idempotent (it
 * deletes prior versions of these three programs by name and re-inserts).
 *
 * Links use our OWN UTMs on the full wander.com/os URL (no dub.co shortener — a
 * redirect through a non-Wander domain is a deliverability tax in cold inboxes,
 * and the tracking SDK already captures utm_* as first/last-touch in Amplitude
 * the moment they land). In Instantly, turn link-tracking OFF for these.
 *
 * Also stages Kristian as a test recipient (gmail +aliases, one per variant) in
 * leads.* so we can push him to the real Instantly campaigns and judge each
 * variant from his own inbox.
 *
 * Run:  bun --conditions react-server scripts/seed-outbound-sequences.ts
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
} from "@/server/db/schema";

const BRAND_ID = "brand_BvLx3xvsfaMvvr4k"; // WanderOS
const OLD_EMILY_PROGRAM_ID = "lp_fNGKtAvHTYvjaKx7"; // "WanderOS Pre-Gen Cold Outbound" (Emily) — superseded

// ---- Sending identity ------------------------------------------------------
// Sticking with the warmed Emily mailbox identity (the From: is "Emily at
// Wander"), so the signature must be Emily too — a Kristian sig from an Emily
// inbox reads as a mismatch. Real replies hand off to a senior rep.
const SENDER = {
  first: "Emily",
  // Warm sign-off only. The formal contact block (name / title / logo) lives as
  // the mailbox-level signature on the Emily account in Instantly, so it
  // auto-appends to every send without double-signing the body. (HTML kept in
  // docs/cold-outbound-playbook.md.)
  sign: "Emily",
  // Kristian/James personas available if a matching mailbox is ever connected.
};
const TEST_EMAIL_BASE = "kristian.e.boe"; // +seqA/+seqB/+seqC@gmail.com aliases all land here

// ---- Links -----------------------------------------------------------------
const utm = (content: string) =>
  `https://www.wander.com/os?utm_source=cold_email&utm_medium=outbound&utm_campaign=pregen_top20&utm_content=${content}`;
const LINK_B = utm("v_b_link");
const LINK_C = utm("v_c_image");
const FLAGSHIP = "hollyhocksuites.com";
// Hollyhock flagship screenshot, downscaled to 1000px JPEG (~160KB) and hosted on
// the growth R2 bucket (uploads/outbound/hollyhock-flagship/).
const FLAGSHIP_IMG =
  "https://pub-d36f3d5f970e419ca42c69144058e8b8.r2.dev/uploads/outbound/hollyhock-flagship/hollyhock-flagship.jpg";

const S = SENDER;
const SEED_TAG = "outbound-sequences-v1";

// ---- Step copy (fallbacks are a backstop only — also clean the lead data) --
type StepSpec = {
  name: string;
  delayMinutes: number;
  delayLabel: string;
  subject: string | null;
  body: string;
  url: string | null;
};

const variantA: StepSpec[] = [
  {
    name: "Intro — here's a live one we built",
    delayMinutes: 0,
    delayLabel: "Day 0",
    subject: "direct bookings for your rentals?",
    url: null,
    body: `Hey {{firstName|there}},

I'll keep this short — we build direct-booking websites for vacation-rental operators, and {{companyName|your business}} looked like a good fit.

Here's a live one we built for a host in Louisville, so you can judge the quality yourself: ${FLAGSHIP}

Same idea for you: your properties, your brand, guests booking direct — instead of handing 15%+ of every stay to the OTAs.

Want me to put a version together for {{companyName|your properties}}? Just reply and I'll send one over.

${S.sign}`,
  },
  {
    name: "Bump — make sure it landed",
    delayMinutes: 2880,
    delayLabel: "Day 2",
    subject: null,
    url: null,
    body: `Hey {{firstName|there}},

Just making sure this reached you. That Louisville site (${FLAGSHIP}) is a real, live Wander site — fast, clean, and built to turn browsers into direct bookings, with guest messaging and AI tools running behind it.

I could spin up the same for {{companyName|your business}} this week. Worth a look?

${S.first}`,
  },
  {
    name: "Breakup — closing the loop",
    delayMinutes: 7200,
    delayLabel: "Day 5",
    subject: null,
    url: null,
    body: `Hey {{firstName|there}},

I'll leave it here so I'm not cluttering your inbox.

If owning more of your bookings — and paying the OTAs less — is on your list this year, just reply "yes" and I'll mock up a direct-booking site for {{companyName|your business}}.

Either way, wishing you a strong season.

${S.first}`,
  },
];

const variantB: StepSpec[] = [
  {
    name: "Intro — here's a live one + see yours",
    delayMinutes: 0,
    delayLabel: "Day 0",
    subject: "direct bookings for your rentals?",
    url: LINK_B,
    body: `Hey {{firstName|there}},

We build direct-booking websites for vacation-rental operators, and {{companyName|your business}} looked like a strong fit.

Here's a live one we built for a host in Louisville: ${FLAGSHIP} — your properties, your brand, guests booking direct instead of handing 15%+ of every stay to the OTAs.

You can see what yours could look like — and get a free site audit — here:
${LINK_B}

Or just reply and I'll put a version together for you.

${S.sign}`,
  },
  {
    name: "Bump — the 2-minute audit",
    delayMinutes: 2880,
    delayLabel: "Day 2",
    subject: null,
    url: LINK_B,
    body: `Hey {{firstName|there}},

Following up on this. The fastest way to see what we'd build for {{companyName|your business}} is the 2-minute audit here:
${LINK_B}

(Or reply and I'll do it for you.) The Louisville site — ${FLAGSHIP} — is a real, live example.

${S.first}`,
  },
  {
    name: "Breakup — grab the audit",
    delayMinutes: 7200,
    delayLabel: "Day 5",
    subject: null,
    url: LINK_B,
    body: `Hey {{firstName|there}},

Last one from me. If paying the OTAs less and owning more of your bookings is on your list this year, grab your free audit here and we'll take it from there:
${LINK_B}

Either way, wishing you a strong season.

${S.first}`,
  },
];

const variantC: StepSpec[] = [
  {
    name: "Intro — screenshot + see yours",
    delayMinutes: 0,
    delayLabel: "Day 0",
    subject: "direct bookings for your rentals?",
    url: LINK_C,
    body: `Hey {{firstName|there}},

We build direct-booking websites for vacation-rental operators, and {{companyName|your business}} looked like a strong fit. Here's the kind of site we'd build for you:

![A direct-booking site we built for a Louisville vacation rental host](${FLAGSHIP_IMG})

That's a real, live Wander site (${FLAGSHIP}) — your properties, your brand, guests booking direct instead of handing 15%+ of every stay to the OTAs.

See what yours could look like — and get a free audit — here:
${LINK_C}

Or just reply and I'll put a version together for you.

${S.sign}`,
  },
  {
    name: "Bump — the 2-minute audit",
    delayMinutes: 2880,
    delayLabel: "Day 2",
    subject: null,
    url: LINK_C,
    body: `Hey {{firstName|there}},

Following up — the fastest way to see what we'd build for {{companyName|your business}} is the 2-minute audit here:
${LINK_C}

(Or reply and I'll do it for you.) The Louisville site — ${FLAGSHIP} — is a real, live example.

${S.first}`,
  },
  {
    name: "Breakup — grab the audit",
    delayMinutes: 7200,
    delayLabel: "Day 5",
    subject: null,
    url: LINK_C,
    body: `Hey {{firstName|there}},

Last one from me. If paying the OTAs less and owning more of your bookings is on your list this year, grab your free audit here and we'll take it from there:
${LINK_C}

Either way, wishing you a strong season.

${S.first}`,
  },
];

const PROGRAMS = [
  {
    variant: "A",
    name: "WanderOS Cold Outbound — A · Reply-first (text only)",
    description: `Cold sequence pitching direct-booking sites to vacation-rental operators, anchored on the live Hollyhock flagship. Variant A: text only, no links, CTA = reply. Deliverability control. Sender: ${S.first}.`,
    utmContent: null as string | null,
    steps: variantA,
  },
  {
    variant: "B",
    name: "WanderOS Cold Outbound — B · Self-serve (text + /os link)",
    description: `Variant B: text + one plain UTM'd wander.com/os link (link-tracking OFF), CTA = self-serve audit or reply. Tests direct form-submit units. Sender: ${S.first}.`,
    utmContent: "v_b_link" as string | null,
    steps: variantB,
  },
  {
    variant: "C",
    name: "WanderOS Cold Outbound — C · Visual (text + link + image)",
    description: `Variant C: text + /os link + inline screenshot. Requested by leadership; running it to measure the deliverability/conversion cost of an image in a cold step. Sender: ${S.first}.`,
    utmContent: "v_c_image" as string | null,
    steps: variantC,
  },
];

// ---------------------------------------------------------------------------

console.log(`Sender identity: ${S.first}`);
if (FLAGSHIP_IMG.startsWith("REPLACE_")) {
  console.warn(
    "⚠️  Variant C image URL is a placeholder — replace FLAGSHIP_IMG with a real hosted screenshot before any real send.",
  );
}

// 1. Retire the superseded Emily program (soft-delete; reversible by clearing deletedAt).
const retired = await db
  .update(lifecycleProgramTable)
  .set({ deletedAt: new Date() })
  .where(
    and(
      eq(lifecycleProgramTable.id, OLD_EMILY_PROGRAM_ID),
      isNull(lifecycleProgramTable.deletedAt),
    ),
  )
  .returning({ id: lifecycleProgramTable.id });
if (retired.length) {
  console.log(
    `Retired old Emily program ${OLD_EMILY_PROGRAM_ID} (soft-delete).`,
  );
}

// 2. Idempotent: drop any prior version of these three programs (steps cascade).
const names = PROGRAMS.map((p) => p.name);
await db
  .delete(lifecycleProgramTable)
  .where(
    and(
      eq(lifecycleProgramTable.brandId, BRAND_ID),
      inArray(lifecycleProgramTable.name, names),
    ),
  );

// 3. Insert the three programs + their steps.
const created: { variant: string; id: string; steps: number }[] = [];
for (const p of PROGRAMS) {
  const [program] = await db
    .insert(lifecycleProgramTable)
    .values({
      brandId: BRAND_ID,
      name: p.name,
      description: p.description,
      kind: "outbound",
      status: "active",
      priority: "should_have",
      workspace: "os",
      intendedTrigger: "Pregen Top 20 — manual enroll (Instantly)",
      intendedChannels: ["email"],
      targetTouchpoints: p.steps.length,
      metadata: {
        seedTag: SEED_TAG,
        variant: p.variant,
        sender: S.first,
        utmContent: p.utmContent,
        flagship: "https://www.hollyhocksuites.com/",
        replyTo: `${TEST_EMAIL_BASE}@gmail.com (test recipient)`,
        leadList: "Pregen Top 20 — 2026-06-10 (279d99ae)",
      },
    })
    .returning();

  for (const [i, s] of p.steps.entries()) {
    await db.insert(lifecycleProgramStepTable).values({
      programId: program!.id,
      name: s.name,
      channel: "email",
      status: "active",
      system: "instantly",
      position: i,
      delayMinutes: s.delayMinutes,
      delayLabel: s.delayLabel,
      subject: s.subject,
      body: s.body,
      url: s.url,
    });
  }
  created.push({ variant: p.variant, id: program!.id, steps: p.steps.length });
}

// 4. Stage Kristian as a test recipient — one gmail +alias per variant.
const TEST_DOMAIN = "outbound-test.wander";
await db.delete(leadDomainTable).where(eq(leadDomainTable.domain, TEST_DOMAIN)); // cascade removes contacts
const [testDom] = await db
  .insert(leadDomainTable)
  .values({
    domain: TEST_DOMAIN,
    companyName: "Outbound Test (Kristian)",
    inInstantly: false,
    excludeFromOutreach: false,
  })
  .returning();

const testContacts = PROGRAMS.map((p) => ({
  domainId: testDom!.id,
  domain: TEST_DOMAIN,
  email: `${TEST_EMAIL_BASE}+seq${p.variant}@gmail.com`.toLowerCase(),
  firstName: "Kristian",
  lastName: "Bø",
  jobTitle: "Founder",
  source: "manual" as const,
  raw: {
    note: `Test recipient for outbound sequence variant ${p.variant}`,
    variant: p.variant,
  },
}));
await db.insert(leadContactTable).values(testContacts);

// 5. Summary.
console.log("\nSeeded outbound sequence programs:");
for (const c of created) {
  console.log(
    `  ${c.variant}: ${c.id} (${c.steps} steps) → /app/lifecycle/${c.id}`,
  );
}
console.log("\nTest recipients (all land in Kristian's gmail):");
for (const c of testContacts) console.log(`  ${c.email}`);
console.log(
  "\nNext: create the matching campaigns in Instantly, push these test",
);
console.log(
  "contacts, turn link-tracking OFF, and confirm before any real send.",
);

process.exit(0);
