# Performance billing

Commercial terms live on `performance_account`: monthly management fee,
agreed ad budget, client media contribution, effective date, term and exclusive
end date. Amounts are USD with two decimal places. Tracker/chat commercial settings remain on the brand and are edited
independently. Neither store automatically synchronizes commercial edits to
the other.

Billing is currently a manually maintained spreadsheet. Chat saves operator input
directly, including overwrites, without payment-provider or campaign verification.
Use `brandWrite.setPerformanceSettings` with `patch.billing` containing a required
`period` (`YYYY-MM`) and any of `managementFee`, `adSpend`, `managementPayment`,
or `spendPayment`. Paid, Open (unpaid), and Not invoiced are manual statuses;
null clears a cell and omitted fields remain unchanged. Past and future months
are equally editable. The result includes the actual saved billing row.
Recording payment never changes the client's journey, business stage, delivery,
or campaign state. Recurring card amounts remain separately editable as
`monthlyFee` and `agreedAdSpend`.

Each `performance_cycle` stores one calendar month. `billedAmount` is the
management fee, `mediaBudget` is the full ad spending limit, and
`clientMediaContribution` is the client media charge. Wander's media contribution
is budget minus client contribution. Null amounts mean unrecorded; zero means a
recorded zero. Actual spend remains in cents. Fee/media paid dates are manual
Paid markers, independent of the cycle's delivery status. The cycle also owns
fee/media invoice states (Open, Not invoiced, or unrecorded). Card reads derive
Paid from these timestamps for the selected billing month; there is no separate
brand JSON payment flag to synchronize. Clearing Paid records Open. Brand
business-stage progression is a separate decision and does not reverse on undo.

Platform campaigns attach directly to a cycle. A planned campaign's cycle is a
default for new deliveries and an explicit bulk-assignment choice; reports use
each platform campaign's direct membership. Attaching one platform campaign
leaves its strategic parent and siblings alone. No synthetic campaign is made.

The client Billing tab edits account defaults and individual months. Account
updates never rewrite existing cycles. The daily `/api/cron/billing` job inserts
missing months through the current month plus two ahead for active/onboarding
accounts, bounded by effective/end dates. Paused, lost and churned brands are
excluded. The account/period constraint makes repeated generation safe. Missing
months are also generated on account creation/update; the UI provides generation
and explicit month creation for longer planning horizons.

Partial first/final months carry a review note. No automatic proration is applied.
New cycles begin planned. Generating a record performs no provider action.
Current-month views match the calendar period explicitly, so future cycles cannot
replace current payment/spend facts. Finance forecasts use saved cycle amounts
where available, then account defaults for months without a cycle.

## Stripe follow-up

Stripe integration is deferred. The intended next step is a read-only mirror:
link the account to a customer, then mirror invoices and their lines in separate
records linked to cycles. Preserve Stripe service-period dates, currency and
invoice/payment facts independently from Growth's expected amounts. An upcoming
cycle is a plan. Future charge edits will need a separate explicit Stripe action.

## Validation

Run normal repository gates. Rehearse the migration on a fresh production-derived
Neon branch, then run:

```sh
bun run db:experiment verify-internal-billing -- bun --conditions=react-server scripts/verify-internal-billing.ts
```

The script rejects ordinary database connections and tests generation, monthly
edit preservation, payment dates, current-month selection, workspace isolation,
zero budgets and the AI result contracts. It cleans up its own fixtures.

