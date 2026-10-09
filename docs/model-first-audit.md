# Model-first audit

## Dashboard billing and the Creative / Delivery handoff

Management fee and agreed monthly ad spend remain contract facts on Performance
settings. A receipt belongs to a specific account and billing period on
`performance_cycle`: management and client media charges have separate paid dates.
The dashboard derives Current and Upcoming payment indicators from those records.
It does not create cycles or infer payment from an unscoped card-state flag.

Removed periodless payment indicators from card status chips and the expanded
commercial sections. Existing payment edit APIs still record receipts on the current
cycle; consolidating those writers is separate work. An absent cycle, an unknown
charge, a zero charge, an open charge, and a recorded payment stay distinguishable.

The existing `launch_prep` stage keeps its stored identity and is renamed Creative.
Delivery is a new stage. Existing clients stay in Creative until an operator moves
them; creative approval and campaign readiness are not guessed from other facts.

## Shared manual pipeline ordering

Each brand's Performance settings owns its stage and one string fractional rank
within that stage. Alphabetical order is a view, not a second writable order.
The move API takes a destination neighbor and computes a rank against the full
organization-scoped column, including cards hidden by search or Mine. Existing
unranked columns start alphabetically and receive initial ranks on the first move.
Moves atomically save stage and rank; row locks serialize simultaneous insertions
without rejecting an operator's edit. Ordinary settings edits now merge only the
submitted JSON fields, preserving concurrent moves and unrelated card-state edits.
A stage changed through the settings editor clears its previous column rank.
No database migration is required: the rank lives in the existing settings JSONB.
