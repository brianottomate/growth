/**
 * Seed strategic lifecycle programs for the wander.com travel marketplace —
 * the "what we want" layer (not the CIO mirror). Opinionated, realistic
 * journeys with steps laid out on an offset-from-start timeline.
 *
 *   bun run scripts/seed-lifecycle.ts
 *
 * Idempotent: matches programs by (brand, name). Existing programs (e.g. the
 * "Marketplace user sign up" one created in the UI) are fleshed out in place;
 * steps are only inserted when the program has none, so re-running is safe.
 * Seeded programs are tagged `metadata.seed = true` for later cleanup.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
  organizationTable,
} from "@/server/db/schema";
import type {
  LifecycleKind,
  LifecycleProgramPriority,
  LifecycleProgramStatus,
  LifecycleStepStatus,
  TouchpointChannel,
} from "@/server/db/schema";

const DAY = 1440; // minutes
const HOUR = 60;

type SeedStep = {
  name: string;
  channel: TouchpointChannel;
  status: LifecycleStepStatus;
  delayMinutes: number;
  subject?: string;
};

type SeedProgram = {
  name: string;
  kind: LifecycleKind;
  priority: LifecycleProgramPriority;
  status: LifecycleProgramStatus;
  description: string;
  intendedTrigger: string;
  intendedChannels: TouchpointChannel[];
  steps: SeedStep[];
};

const PROGRAMS: SeedProgram[] = [
  {
    // Matches the program already created in the UI — gets fleshed out.
    name: "Marketplace user sign up",
    kind: "onboarding",
    priority: "must_have",
    status: "active",
    description:
      "Everyone who signs up to the marketplace gets a proper welcome: understand how Wander works, set travel preferences, see curated stays, and get nudged toward a first booking.",
    intendedTrigger: "user_signed_up",
    intendedChannels: ["email", "push"],
    steps: [
      {
        name: "Welcome email",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "Welcome to Wander — your next trip starts here",
      },
      {
        name: "How Wander works",
        channel: "email",
        status: "planned",
        delayMinutes: 1 * DAY,
        subject: "Unique stays, booked with confidence — here's how",
      },
      {
        name: "Set your travel preferences",
        channel: "email",
        status: "planned",
        delayMinutes: 2 * DAY,
        subject: "Tell us where you want to go",
      },
      {
        name: "Curated stays for you",
        channel: "email",
        status: "planned",
        delayMinutes: 4 * DAY,
        subject: "Handpicked stays we think you'll love",
      },
      {
        name: "First-trip offer",
        channel: "email",
        status: "planned",
        delayMinutes: 7 * DAY,
        subject: "$50 toward your first Wander stay",
      },
    ],
  },
  {
    name: "Abandoned booking recovery",
    kind: "abandoned_cart",
    priority: "must_have",
    status: "active",
    description:
      "Travelers who start a booking but don't complete it — bring them back before the dates slip, then offer a human hand for high-value trips.",
    intendedTrigger: "checkout_started",
    intendedChannels: ["email", "bdr_task"],
    steps: [
      {
        name: "Your stay is still available",
        channel: "email",
        status: "active",
        delayMinutes: 1 * HOUR,
        subject: "Still thinking it over? Your stay is held for now",
      },
      {
        name: "Dates are filling up",
        channel: "email",
        status: "planned",
        delayMinutes: 1 * DAY,
        subject: "Your dates are popular — book before they're gone",
      },
      {
        name: "Concierge outreach (high value)",
        channel: "bdr_task",
        status: "planned",
        delayMinutes: 2 * DAY,
        subject: "Personal follow-up to help complete the booking",
      },
    ],
  },
  {
    name: "Lapsed traveler win-back",
    kind: "reactivation",
    priority: "should_have",
    status: "active",
    description:
      "Re-engage travelers who booked or browsed but haven't returned in 90 days — remind them what's new, inspire with destinations, then incentivize a return trip.",
    intendedTrigger: "no_activity_90d",
    intendedChannels: ["email"],
    steps: [
      {
        name: "We miss you",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "We miss you — here's what's new at Wander",
      },
      {
        name: "Seasonal destinations",
        channel: "email",
        status: "planned",
        delayMinutes: 7 * DAY,
        subject: "Where Wander travelers are going this season",
      },
      {
        name: "Win-back offer",
        channel: "email",
        status: "planned",
        delayMinutes: 14 * DAY,
        subject: "Come back with 10% off your next stay",
      },
      {
        name: "Last call",
        channel: "email",
        status: "missing",
        delayMinutes: 21 * DAY,
        subject: "One last invite (and a final offer)",
      },
    ],
  },
  {
    // Ported from the CIO mirror — the core marketplace journey, scattered
    // there across ~10 campaigns (pre-trip variants, check-in, on-trip,
    // post-trip, survey). Modeled here as one linear journey; the content
    // branching (travel guides / pre-trip info) stays in CIO.
    name: "Trip experience lifecycle",
    kind: "behavioral",
    priority: "must_have",
    status: "active",
    description:
      "The end-to-end stay journey: prep travelers before arrival, guide them through check-in and the stay, and close with a review ask. Anchored ~3 days before check-in.",
    intendedTrigger: "trip_upcoming (≈3d before check-in)",
    intendedChannels: ["email", "push"],
    steps: [
      {
        name: "Pre-trip guide & local tips",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "Your trip is coming up — everything you need to know",
      },
      {
        name: "Check-in day instructions",
        channel: "email",
        status: "active",
        delayMinutes: 3 * DAY,
        subject: "You're checking in today — codes, directions, WiFi",
      },
      {
        name: "Mid-stay check-in",
        channel: "email",
        status: "planned",
        delayMinutes: 4 * DAY,
        subject: "Settling in? Make the most of your stay",
      },
      {
        name: "Checkout reminder",
        channel: "email",
        status: "planned",
        delayMinutes: 7 * DAY,
        subject: "Checking out tomorrow — steps & late-checkout options",
      },
      {
        name: "Post-stay review request",
        channel: "email",
        status: "active",
        delayMinutes: 8 * DAY,
        subject: "How was your stay? Leave a review",
      },
    ],
  },
  {
    // Ported from CIO: "Review request after rating us 9 or 10", "Referral
    // rewarded". NPS-gated advocacy + referral loop.
    name: "Advocacy & referral",
    kind: "behavioral",
    priority: "should_have",
    status: "active",
    description:
      "Turn happy guests into advocates: gate on a strong rating, ask for a public review, then drive referrals and reward both sides.",
    intendedTrigger: "stay_completed",
    intendedChannels: ["email"],
    steps: [
      {
        name: "Rate your stay (NPS)",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "How was your Wander stay?",
      },
      {
        name: "Review request (rated 9–10)",
        channel: "email",
        status: "active",
        delayMinutes: 2 * DAY,
        subject: "Loved it? Share your review",
      },
      {
        name: "Referral invite",
        channel: "email",
        status: "planned",
        delayMinutes: 4 * DAY,
        subject: "Give friends $50, get $50",
      },
      {
        name: "Referral reward delivered",
        channel: "email",
        status: "missing",
        delayMinutes: 14 * DAY,
        subject: "Your referral reward is here",
      },
    ],
  },
  {
    // Ported from CIO: "Property added to wishlist", "Property page
    // abandonment", "Wishlist homes this month". Top-of-funnel intent capture
    // before checkout (distinct from Abandoned booking recovery).
    name: "Browse & wishlist nurture",
    kind: "behavioral",
    priority: "should_have",
    status: "active",
    description:
      "Capture intent before checkout: when travelers save or view homes, keep those stays top-of-mind with availability and price nudges.",
    intendedTrigger: "property_wishlisted",
    intendedChannels: ["email", "push"],
    steps: [
      {
        name: "Wishlist saved",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "Saved to your wishlist — here's what's nearby",
      },
      {
        name: "Property you viewed is still available",
        channel: "email",
        status: "planned",
        delayMinutes: 1 * DAY,
        subject: "Still available — the home you were looking at",
      },
      {
        name: "Wishlist homes this month",
        channel: "email",
        status: "planned",
        delayMinutes: 7 * DAY,
        subject: "Your wishlist homes — what's open this month",
      },
      {
        name: "Price drop / availability alert",
        channel: "email",
        status: "missing",
        delayMinutes: 14 * DAY,
        subject: "Good news about a home on your wishlist",
      },
    ],
  },
  {
    // Ported from CIO: "Canceled bookings follow up" (Order Cancelled).
    // Win-back specific to a cancellation, not a 90-day lapse.
    name: "Cancellation recovery",
    kind: "behavioral",
    priority: "should_have",
    status: "active",
    description:
      "When a booking is cancelled, keep the door open: acknowledge, offer flexible rebooking, surface alternatives, then a comeback incentive.",
    intendedTrigger: "order_cancelled",
    intendedChannels: ["email"],
    steps: [
      {
        name: "Sorry your plans changed",
        channel: "email",
        status: "active",
        delayMinutes: 0,
        subject: "We're here when you're ready to travel again",
      },
      {
        name: "Flexible rebooking options",
        channel: "email",
        status: "planned",
        delayMinutes: 2 * DAY,
        subject: "Need different dates? Here's what's available",
      },
      {
        name: "Similar stays you might like",
        channel: "email",
        status: "planned",
        delayMinutes: 5 * DAY,
        subject: "Hand-picked alternatives for your trip",
      },
      {
        name: "Comeback offer",
        channel: "email",
        status: "missing",
        delayMinutes: 14 * DAY,
        subject: "Ready to rebook? Here's 10% off",
      },
    ],
  },
];

async function main() {
  const org = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
  });
  if (!org) throw new Error("No 'wander' org — run the seed first.");

  const wander = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, "wander"), eq(brandTable.organizationId, org.id)),
  });
  if (!wander) throw new Error("No 'wander' brand.");
  console.log(`✓ target brand: ${wander.name} (${wander.id})`);

  for (const p of PROGRAMS) {
    // Upsert the program by (brand, name).
    let program = await db.query.lifecycleProgramTable.findFirst({
      where: and(
        eq(lifecycleProgramTable.brandId, wander.id),
        eq(lifecycleProgramTable.name, p.name),
        isNull(lifecycleProgramTable.deletedAt),
      ),
    });

    const values = {
      kind: p.kind,
      status: p.status,
      priority: p.priority,
      description: p.description,
      intendedTrigger: p.intendedTrigger,
      intendedChannels: p.intendedChannels,
      targetTouchpoints: p.steps.length,
      metadata: { seed: true },
    };

    if (program) {
      await db
        .update(lifecycleProgramTable)
        .set(values)
        .where(eq(lifecycleProgramTable.id, program.id));
      console.log(`↻ updated program "${p.name}"`);
    } else {
      [program] = await db
        .insert(lifecycleProgramTable)
        .values({ brandId: wander.id, name: p.name, ...values })
        .returning();
      console.log(`+ created program "${p.name}"`);
    }
    if (!program) throw new Error(`Failed to upsert program "${p.name}"`);

    // Only insert steps if the program has none (don't clobber edits).
    const existingSteps = await db.query.lifecycleProgramStepTable.findMany({
      where: eq(lifecycleProgramStepTable.programId, program.id),
      columns: { id: true },
    });
    if (existingSteps.length > 0) {
      console.log(`  · ${existingSteps.length} steps already present — skipped`);
      continue;
    }

    await db.insert(lifecycleProgramStepTable).values(
      p.steps.map((s, i) => ({
        programId: program.id,
        name: s.name,
        channel: s.channel,
        status: s.status,
        delayMinutes: s.delayMinutes,
        subject: s.subject ?? null,
        position: i,
      })),
    );
    console.log(`  + ${p.steps.length} steps`);
  }

  console.log("✓ done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
