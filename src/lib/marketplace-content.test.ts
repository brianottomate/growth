import { describe, expect, test } from "bun:test";

import {
  auditMarketplace,
  marketplaceQueue,
  type MarketplaceListing,
} from "./marketplace-content";

const sample: MarketplaceListing = {
  id: "wander-test",
  product: "Wander",
  surfaceId: "app_store",
  audience: "Guests",
  strategy: "Book a stay",
  availability: "testing",
  fields: [
    {
      fieldId: "name",
      truth: "source_verified",
      content: "Wander Staging",
      evidence: [
        { source: "operator", label: "TestFlight", checkedAt: "2026-07-20" },
      ],
    },
    { fieldId: "privacy", truth: "verify" },
    { fieldId: "screenshots", truth: "missing" },
    { fieldId: "previews", truth: "deferred" },
  ],
};

describe("marketplace content", () => {
  test("keeps source proof separate from open placements", () => {
    const audit = auditMarketplace([sample]);
    expect(audit.verified).toBe(1);
    expect(audit.evidenced).toBe(1);
    expect(audit.open).toBe(2);
    expect(audit.missing).toBe(1);
  });

  test("puts missing work before verification", () => {
    const queue = marketplaceQueue([sample]);
    expect(queue[0]?.item.fieldId).toBe("screenshots");
    expect(queue[1]?.item.fieldId).toBe("privacy");
  });
});
