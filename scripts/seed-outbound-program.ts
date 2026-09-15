import { db } from "@/server/db";
import {
  lifecycleProgramTable,
  lifecycleProgramStepTable,
} from "@/server/db/schema";

const BRAND_ID = "brand_BvLx3xvsfaMvvr4k"; // WanderOS

const [program] = await db
  .insert(lifecycleProgramTable)
  .values({
    brandId: BRAND_ID,
    name: "WanderOS Pre-Gen Cold Outbound",
    description:
      "Cold sequence pitching direct-booking sites to vacation-rental operators, anchored on the live Hollyhock flagship. First send: the Pregen Top 20 list.",
    kind: "outbound",
    status: "active",
    priority: "should_have",
    workspace: "os",
    targetTouchpoints: 3,
    metadata: {
      instantlyTestCampaignId: "1287d6a2-6102-4222-be73-b1c5a5005269",
      instantlyRealCampaignId: "5bc37887-d73e-45e5-a01c-e3577eb8111e",
      leadList: "Pregen Top 20 — 2026-06-10 (279d99ae)",
      flagship: "https://www.hollyhocksuites.com/",
    },
  })
  .returning();

const steps = [
  {
    name: "Intro — here's a live one we built",
    delayMinutes: 0,
    subject: "a direct booking site for {{companyName|your business}}?",
    body: `Hey {{firstName|there}},

Quick one — we build direct booking websites for vacation rental operators, and {{companyName|your business}} looks like a great fit.

Here's a live one we built for a host in Louisville so you can judge the quality for yourself: hollyhocksuites.com

Same idea for you: your properties, your brand, guests booking direct — instead of handing 15%+ of every reservation to the OTAs.

Want me to put together a version for {{companyName|your business}}? Just reply and I'll get one over to you.

Emily`,
  },
  {
    name: "Proof — the screenshot",
    delayMinutes: 2880,
    subject: "",
    body: `Hey {{firstName|there}},

Wanted to make sure this landed — here's the kind of site we'd build for {{companyName|your business}}:

[Hollyhock flagship screenshot]

That's a real, live Wander site — fast, clean, and built to turn browsers into direct bookings, with automated guest messaging and AI tools running on the back end.

I can have a {{companyName|your business}} version ready this week. Worth a look?

Emily`,
  },
  {
    name: "Breakup — closing the loop",
    delayMinutes: 5760,
    subject: "",
    body: `Hey {{firstName|there}},

I'll leave it here so I'm not cluttering your inbox.

If owning more of your bookings — and paying the OTAs less — is on your list this year, I'd love to show you what a direct-booking site could do for {{companyName|your business}}. Just reply "yes" and I'll take it from there.

Either way, wishing you a strong season.

Emily`,
  },
];

for (const [i, s] of steps.entries()) {
  await db.insert(lifecycleProgramStepTable).values({
    programId: program!.id,
    name: s.name,
    channel: "email",
    status: "active",
    system: "instantly",
    position: i,
    delayMinutes: s.delayMinutes,
    subject: s.subject || null,
    body: s.body,
  });
}

console.log(`seeded program ${program!.id} with ${steps.length} steps`);
console.log(`open: /app/lifecycle/${program!.id}`);
process.exit(0);
