import { expect, test } from "bun:test";
import { metaAdBillingStatus, metaBillingIssueFrom } from "./meta-ad-billing";

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

// 30A Beach Stays, 2026-10-16: Zernio read billing "ok" while every push came
// back "No Payment Method". The push's refusal has to win on the card.
test("a billing refusal from a push outranks Zernio's ok", () => {
  const pushError = new Error(
    `Meta push stopped while creating ad set 1 of 1 (Families): Zernio /ads/create failed: 400 ${JSON.stringify(
      {
        error:
          "Meta Ads API error (400; code 100, subcode 1359188): Update payment method",
        platformError: {
          code: 100,
          error_subcode: 1359188,
          error_user_title: "No Payment Method",
          error_user_msg:
            "Update payment method: Visit the Billing and payment center to add a valid payment method.",
        },
      },
    )}. Kept on Meta, paused: campaign 1 with 0 ad sets and 0 ads.`,
  );
  const issue = metaBillingIssueFrom(pushError);
  expect(issue).toEqual({
    subcode: 1359188,
    message:
      "Update payment method: Visit the Billing and payment center to add a valid payment method.",
  });
  expect(
    metaAdBillingStatus(
      { billingStatus: "ok" },
      { ...issue!, at: "2026-10-16T16:14:10.761Z" },
    ),
  ).toBe("payment_issue");
  expect(
    metaBillingIssueFrom(
      new Error(
        'Zernio /ads/create failed: 400 {"platformError":{"error_subcode":1815045,"error_user_title":"Account does not have access to pixel"}}',
      ),
    ),
  ).toBeNull();
});
