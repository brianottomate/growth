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
  LifecycleStepSystem,
  LifecycleWorkspace,
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
  /** Which system delivers/owns this step (CIO, Outreach, product, human…). */
  system?: LifecycleStepSystem;
  url?: string;
  /** Name of an EARLIER step in the same program this branches from. */
  branchOf?: string;
  /** The branch condition shown on the edge. */
  branchLabel?: string;
};

type SeedProgram = {
  name: string;
  kind: LifecycleKind;
  priority: LifecycleProgramPriority;
  status: LifecycleProgramStatus;
  workspace?: LifecycleWorkspace; // defaults to marketplace
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
        system: "customerio",
        delayMinutes: 0,
        subject: "Welcome to Wander — your next trip starts here",
      },
      {
        name: "How Wander works",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 1 * DAY,
        subject: "Unique stays, booked with confidence — here's how",
      },
      {
        name: "Set your travel preferences",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 2 * DAY,
        subject: "Tell us where you want to go",
      },
      {
        name: "Curated stays for you",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 4 * DAY,
        subject: "Handpicked stays we think you'll love",
      },
      {
        name: "First-trip offer",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 7 * DAY,
        branchOf: "Curated stays for you",
        branchLabel: "no booking after 7d",
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
        system: "customerio",
        delayMinutes: 1 * HOUR,
        subject: "Still thinking it over? Your stay is held for now",
      },
      {
        name: "Dates are filling up",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 1 * DAY,
        subject: "Your dates are popular — book before they're gone",
      },
      {
        name: "Concierge outreach (high value)",
        channel: "bdr_task",
        status: "planned",
        system: "human",
        delayMinutes: 2 * DAY,
        branchOf: "Dates are filling up",
        branchLabel: "trip value > $5k",
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
    intendedChannels: ["email", "webhook"],
    steps: [
      {
        name: "90-day inactive cohort sync",
        channel: "webhook",
        status: "active",
        system: "amplitude",
        delayMinutes: 0,
        subject: "Amplitude behavioral cohort synced to CIO segment",
      },
      {
        name: "We miss you",
        channel: "email",
        status: "active",
        system: "customerio",
        delayMinutes: 1 * HOUR,
        subject: "We miss you — here's what's new at Wander",
      },
      {
        name: "Seasonal destinations",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 7 * DAY,
        subject: "Where Wander travelers are going this season",
      },
      {
        name: "Win-back offer",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 14 * DAY,
        subject: "Come back with 10% off your next stay",
      },
      {
        name: "Last call",
        channel: "email",
        status: "missing",
        system: "customerio",
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
        system: "customerio",
        delayMinutes: 0,
        subject: "Your trip is coming up — everything you need to know",
      },
      {
        name: "Check-in day instructions",
        channel: "email",
        status: "active",
        system: "postmark",
        delayMinutes: 3 * DAY,
        subject: "You're checking in today — codes, directions, WiFi",
      },
      {
        name: "Mid-stay check-in",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 4 * DAY,
        subject: "Settling in? Make the most of your stay",
      },
      {
        name: "Checkout reminder",
        channel: "email",
        status: "planned",
        system: "postmark",
        delayMinutes: 7 * DAY,
        subject: "Checking out tomorrow — steps & late-checkout options",
      },
      {
        name: "Post-stay review request",
        channel: "email",
        status: "active",
        system: "customerio",
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
        system: "customerio",
        delayMinutes: 0,
        subject: "How was your Wander stay?",
      },
      {
        name: "Review request",
        channel: "email",
        status: "active",
        system: "customerio",
        delayMinutes: 2 * DAY,
        branchOf: "Rate your stay (NPS)",
        branchLabel: "rated 9–10",
        subject: "Loved it? Share your review",
      },
      {
        name: "Service recovery follow-up",
        channel: "bdr_task",
        status: "missing",
        system: "human",
        delayMinutes: 1 * DAY,
        branchOf: "Rate your stay (NPS)",
        branchLabel: "rated ≤ 6",
        subject: "Personal apology + make-it-right outreach",
      },
      {
        name: "Referral invite",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 4 * DAY,
        subject: "Give friends $50, get $50",
      },
      {
        name: "Referral reward delivered",
        channel: "email",
        status: "missing",
        system: "postmark",
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
        system: "customerio",
        delayMinutes: 0,
        subject: "Saved to your wishlist — here's what's nearby",
      },
      {
        name: "Property you viewed is still available",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 1 * DAY,
        subject: "Still available — the home you were looking at",
      },
      {
        name: "Wishlist homes this month",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 7 * DAY,
        subject: "Your wishlist homes — what's open this month",
      },
      {
        name: "Price drop / availability alert",
        channel: "push",
        status: "missing",
        system: "system",
        delayMinutes: 14 * DAY,
        branchOf: "Wishlist saved",
        branchLabel: "price drops or dates open up",
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
        name: "Cancellation confirmation",
        channel: "email",
        status: "active",
        system: "postmark",
        delayMinutes: 0,
        subject: "Your booking is cancelled — refund details inside",
      },
      {
        name: "Flexible rebooking options",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 2 * DAY,
        subject: "Need different dates? Here's what's available",
      },
      {
        name: "Similar stays you might like",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 5 * DAY,
        subject: "Hand-picked alternatives for your trip",
      },
      {
        name: "Comeback offer",
        channel: "email",
        status: "missing",
        system: "customerio",
        delayMinutes: 14 * DAY,
        subject: "Ready to rebook? Here's 10% off",
      },
    ],
  },

  // ---- WanderOS (host-side) journeys -------------------------------
  // Grounded in the real funnels: wander.com/os + /list → POST
  // /api/os/inbound | /api/list/apply (HubSpot routing, Slack alert,
  // Make.com enrichment) → app.wander.com/welcome wizard (Intent →
  // BusinessName → AutoList → ConnectPms → Outro). Tracked events:
  // "WanderOS Inbound Submitted", "Organization Created",
  // "PMS Connection Success", "Onboarding Completed".
  {
    name: "OS inbound lead follow-up",
    kind: "behavioral",
    priority: "must_have",
    status: "active",
    workspace: "os",
    description:
      "A property manager submits the /os or /list form. The routing plumbing is live (HubSpot, Slack, enrichment) — the human + messaging follow-up around it is the strategy we want to formalize.",
    intendedTrigger: "WanderOS Inbound Submitted",
    intendedChannels: ["email", "bdr_task", "slack", "webhook"],
    steps: [
      {
        name: "Lead routed in HubSpot",
        channel: "webhook",
        status: "active",
        system: "system",
        delayMinutes: 0,
        subject:
          "Contact/company/deal upsert + round-robin AE/BDR by portfolio size",
      },
      {
        name: "Slack alert #os-inbound-radio",
        channel: "slack",
        status: "active",
        system: "system",
        delayMinutes: 0,
        subject: "Lead classification + HubSpot links posted to the channel",
      },
      {
        name: "AI portfolio enrichment",
        channel: "webhook",
        status: "active",
        system: "other",
        delayMinutes: 0,
        subject: "Make.com agent enriches email/site/units",
      },
      {
        name: "BDR intro sequence",
        channel: "email",
        status: "planned",
        system: "outreach",
        delayMinutes: 1 * HOUR,
        subject: "Personal intro from the assigned BDR",
      },
      {
        name: "Follow-up call task",
        channel: "bdr_task",
        status: "planned",
        system: "outreach",
        delayMinutes: 3 * DAY,
        branchOf: "BDR intro sequence",
        branchLabel: "no reply after 3d",
      },
      {
        name: "Demo booked → handoff",
        channel: "email",
        status: "planned",
        system: "human",
        delayMinutes: 0,
        branchOf: "BDR intro sequence",
        branchLabel: "replied / meeting booked",
        subject: "Calendar confirm + what to prepare",
      },
      {
        name: "Stalled-lead winback",
        channel: "email",
        status: "missing",
        system: "customerio",
        delayMinutes: 7 * DAY,
        branchOf: "Lead routed in HubSpot",
        branchLabel: "never started app onboarding (7d)",
        subject: "Your WanderOS setup is one click away",
      },
    ],
  },
  {
    name: "WanderOS host onboarding",
    kind: "onboarding",
    priority: "must_have",
    status: "active",
    workspace: "os",
    description:
      "From 'Organization Created' in app.wander.com/welcome to a fully onboarded host: PMS connected, listings live, habit formed. The wizard exists; the messaging safety-net around drop-off is mostly missing.",
    intendedTrigger: "Organization Created",
    intendedChannels: ["email", "in_app", "bdr_task"],
    steps: [
      {
        name: "Onboarding wizard",
        channel: "in_app",
        status: "active",
        system: "system",
        delayMinutes: 0,
        subject: "Intent → business name → auto-list → connect PMS → outro",
        url: "https://app.wander.com/welcome",
      },
      {
        name: "Welcome to WanderOS",
        channel: "email",
        status: "missing",
        system: "customerio",
        delayMinutes: 0,
        subject: "You're in — here's what happens next",
      },
      {
        name: "PMS connection nudge",
        channel: "email",
        status: "missing",
        system: "customerio",
        delayMinutes: 1 * DAY,
        branchOf: "Onboarding wizard",
        branchLabel: "PMS not connected after 24h",
        subject: "Connect your PMS to unlock your site",
      },
      {
        name: "Concierge setup call",
        channel: "bdr_task",
        status: "planned",
        system: "human",
        delayMinutes: 3 * DAY,
        branchOf: "PMS connection nudge",
        branchLabel: "still not connected after 3d",
        subject: "White-glove PMS connection offer",
      },
      {
        name: "Listings live celebration",
        channel: "email",
        status: "missing",
        system: "postmark",
        delayMinutes: 2 * DAY,
        subject: "Your properties are live on Wander",
      },
      {
        name: "Week-1 performance digest",
        channel: "email",
        status: "missing",
        system: "postmark",
        delayMinutes: 7 * DAY,
        subject: "Your first week on WanderOS, in numbers",
      },
    ],
  },
  {
    // Marketplace listing is moving behind a $1/month subscription (mandatory
    // card capture) inside the app.wander.com/welcome wizard. Hosts who stall
    // at that step already have an account and an email, so this is an
    // abandoned-cart shape on the OS side. Prerequisite before this can run:
    // instrument "Listing CC Capture Started" and "Listing Subscription
    // Activated" in the wizard's tracking plan.
    name: "Listing subscription capture recovery",
    kind: "abandoned_cart",
    priority: "must_have",
    status: "planned",
    workspace: "os",
    description:
      "Hosts who reach the $1/month card-capture step for listing on the wander.com marketplace but don't complete it. They are signed up and reachable by email; recover them like an abandoned cart. Trigger: 'Listing CC Capture Started' with no 'Listing Subscription Activated' within 1 hour. Tracking events not yet instrumented.",
    intendedTrigger: "Listing CC Capture Started",
    intendedChannels: ["email", "bdr_task"],
    steps: [
      {
        name: "Your listing is almost live",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 1 * HOUR,
        subject: "Your listing is almost live",
      },
      {
        name: "Why we ask for a card",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 1 * DAY,
        subject: "It is $1 a month. Here is what it unlocks",
      },
      {
        name: "Concierge outreach (high value)",
        channel: "bdr_task",
        status: "planned",
        system: "human",
        delayMinutes: 2 * DAY,
        branchOf: "Why we ask for a card",
        branchLabel: "multi-property or PMS connected",
        subject: "Personal follow-up to finish marketplace listing",
      },
      {
        name: "Pick up where you left off",
        channel: "email",
        status: "planned",
        system: "customerio",
        delayMinutes: 3 * DAY,
        subject: "Finish listing on the Wander marketplace",
        url: "https://app.wander.com/welcome",
      },
    ],
  },

  // ---- Shared (spans both product lines) ----------------------------
  {
    // app.wander.com signs users in with an emailed OTP code; account
    // emails serve travelers and hosts alike. System tags are a best guess
    // (resend vs postmark) — correct in the UI if wrong.
    name: "Account & auth transactional",
    kind: "transactional",
    priority: "must_have",
    status: "active",
    workspace: "shared",
    description:
      "The table-stakes account emails every user hits regardless of product line: OTP sign-in, password reset, email change. Must be instant and deliverable — these are the emails that can never break.",
    intendedTrigger: "auth events (OTP requested / reset / email change)",
    intendedChannels: ["email"],
    steps: [
      {
        name: "OTP sign-in code",
        channel: "email",
        status: "active",
        system: "resend",
        delayMinutes: 0,
        subject: "Your Wander sign-in code",
      },
      {
        name: "Password reset",
        channel: "email",
        status: "active",
        system: "resend",
        delayMinutes: 0,
        subject: "Reset your Wander password",
      },
      {
        name: "Email change confirmation",
        channel: "email",
        status: "planned",
        system: "resend",
        delayMinutes: 0,
        subject: "Confirm your new email address",
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
    where: and(
      eq(brandTable.slug, "wander"),
      eq(brandTable.organizationId, org.id),
    ),
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
      workspace: p.workspace ?? ("marketplace" as const),
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

    // Only insert steps if the program has none (don't clobber edits) —
    // unless --replace-steps is passed, which wipes and reseeds them.
    const replaceSteps = process.argv.includes("--replace-steps");
    const existingSteps = await db.query.lifecycleProgramStepTable.findMany({
      where: eq(lifecycleProgramStepTable.programId, program.id),
      columns: { id: true },
    });
    if (existingSteps.length > 0) {
      if (!replaceSteps) {
        console.log(
          `  · ${existingSteps.length} steps already present — skipped`,
        );
        continue;
      }
      await db
        .delete(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.programId, program.id));
      console.log(`  − replaced ${existingSteps.length} existing steps`);
    }

    // Insert in author order so branch parents (referenced by name) exist
    // before their children.
    const idByName = new Map<string, string>();
    for (const [i, s] of p.steps.entries()) {
      const parentStepId = s.branchOf ? idByName.get(s.branchOf) : null;
      if (s.branchOf && !parentStepId) {
        throw new Error(
          `Step "${s.name}" branches off unknown step "${s.branchOf}" in "${p.name}"`,
        );
      }
      const [row] = await db
        .insert(lifecycleProgramStepTable)
        .values({
          programId: program.id,
          name: s.name,
          channel: s.channel,
          status: s.status,
          system: s.system ?? null,
          delayMinutes: s.delayMinutes,
          subject: s.subject ?? null,
          url: s.url ?? null,
          parentStepId: parentStepId ?? null,
          branchLabel: s.branchLabel ?? null,
          position: i,
        })
        .returning({ id: lifecycleProgramStepTable.id });
      if (row) idByName.set(s.name, row.id);
    }
    console.log(`  + ${p.steps.length} steps`);
  }

  console.log("✓ done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
