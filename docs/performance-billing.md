# Performance billing

Commercial terms live on `performance_account`: monthly management fee,
agreed ad budget, client media contribution, effective date, term and exclusive
end date. Amounts are USD with two decimal places. The existing tracker/chat
commercial fields also write these account defaults.

Each `performance_cycle` snapshots one calendar month. `billedAmount` is the
management fee, `mediaBudget` is the full ad spending limit, and
`clientMediaContribution` is the client media charge. Wander's media contribution
is budget minus client contribution. Null amounts mean unrecorded; zero means a
recorded zero. Actual spend remains in cents. Fee/media paid dates are manual
receipts, independent of the cycle's delivery status.

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
