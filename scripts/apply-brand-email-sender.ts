/**
 * Exact additive DDL for a brand's email sender and legal identity, plus the
 * two senders that exist today.
 *
 * Development and production share one Neon database, so running this is an
 * intentional production operation. It adds one nullable column, moves Winter
 * Park Escapes' sender out of its Performance settings, and writes Wander's
 * frame (what its newsletter template used to hardcode) as Wander's sender.
 * Re-running it is safe.
 *
 *   bun run db:apply:brand-email-sender
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import type {
  BrandEmailSender,
  BrandLegalIdentity,
} from "@/server/db/brand-schema";

await db.execute(
  sql`alter table public.brand add column if not exists email_sender jsonb`,
);
await db.execute(
  sql`alter table public.brand add column if not exists legal_identity jsonb`,
);

// Winter Park Escapes' sender was first written under performance_settings.
await db.execute(sql`
  update public.brand
  set email_sender = performance_settings->'emailSender',
      performance_settings = performance_settings - 'emailSender'
  where performance_settings ? 'emailSender' and email_sender is null
`);

const cioAsset = (id: string) =>
  `https://userimg-assets.customeriomail.com/images/client-env-142511/${id}`;

const wander: BrandEmailSender = {
  fromName: "Wander",
  logoUrl: cioAsset("01KXNRPZDGBB5VWW26X4VP4NBA.png"),
  tagline: "Find your happy place ®",
  siteUrl: "https://www.wander.com",
  siteCtaLabel: "Explore your next adventure",
  contact: {
    phone: "+14157993400",
    note: "Responses in 3 mins • Available 24/7",
    imageUrl: cioAsset("01KYR02DY9B3C1X848ZJ2GRR6P.png"),
    heading: "Need help? We're here for you.",
    text: "Your Personal Concierge is available to help you think through options and make your reservation.",
    textLabel: "Text with your Concierge",
    callLabel: "Call your Concierge",
  },
  valueProps: [
    {
      iconUrl: cioAsset("01KYQRV2KKD3CA8BMAH0ZPGECA.png"),
      label: "Best homes",
    },
    {
      iconUrl: cioAsset("01KYQS88F0XSPRMQ7RV9DE4592.png"),
      label: "24/7 service",
    },
    {
      iconUrl: cioAsset("01KZ1PY8AT3CYQF5HTYJKZKGSP.png"),
      label: "Great prices",
    },
  ],
};

await db.execute(sql`
  update public.brand set email_sender = ${JSON.stringify(wander)}::jsonb
  where slug = 'wander' and email_sender is null
`);

// The address used to sit on the sender; it belongs to the brand's legal identity.
await db.execute(sql`
  update public.brand set email_sender = email_sender - 'postalAddress'
  where email_sender ? 'postalAddress'
`);

const wanderLegal: BrandLegalIdentity = {
  legalName: "Wander.com, Inc.",
  address: {
    line1: "200 Academy Drive",
    line2: "Suite 200",
    city: "Austin",
    region: "TX",
    postalCode: "78704",
    country: "US",
  },
};
await db.execute(sql`
  update public.brand set legal_identity = ${JSON.stringify(wanderLegal)}::jsonb
  where slug = 'wander' and legal_identity is null
`);

console.log("brand email senders and legal identities are ready.");
