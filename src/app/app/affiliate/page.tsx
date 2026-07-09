import type { Metadata } from "next";

import { AffiliateDesk } from "./AffiliateDesk";

export const metadata: Metadata = { title: "Affiliate" };

// The affiliate ops desk — triage queue for the in-house Impact.com program
// (docs/affiliate-program-takeover.md). v1 is the inbound-email inbox; the
// applications / partners / reports tabs arrive with the monitor crons.
export default function AffiliatePage() {
  return <AffiliateDesk />;
}
