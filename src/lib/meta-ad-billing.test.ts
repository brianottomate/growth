import { expect, test } from "bun:test";
import { metaAdBillingStatus } from "./meta-ad-billing";

// Prevent a connected/active account or hidden billing fields from falsely
// telling operators that the client's payment setup is complete.
test("billing presence requires explicit provider evidence", () => {
  expect(metaAdBillingStatus({ accountStatus: 1 })).toBe("unknown");
  expect(metaAdBillingStatus({ billingStatus: "unknown" })).toBe("unknown");
  expect(metaAdBillingStatus({ billingStatus: "missing" })).toBe("missing");
  expect(metaAdBillingStatus({ billingStatus: "ok" })).toBe("present");
});

test("payment problems override payment method presence", () => {
  for (const accountStatus of [3, 8, 9, "3", "8", "9"]) {
    expect(metaAdBillingStatus({ billingStatus: "ok", accountStatus })).toBe(
      "payment_issue",
    );
  }
  expect(metaAdBillingStatus({ billingStatus: "ok", disableReason: 3 })).toBe(
    "payment_issue",
  );
});
