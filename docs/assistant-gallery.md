# Assistant gallery

The signed-in team gallery lives at `/lab/design-system/chat`, linked from
`/lab`. It inherits the Lab access gate and no-index metadata.

The gallery renders synthetic results through the same `renderToolPart`
function used by `OverviewChat`. It covers conversation anatomy, pending and
interrupted tools, errors, approval requests and superseded approvals, result
cards, suggested next steps, and the durable input queue. Demo callbacks update
local state. Fixture detail links report their destination on the page.
Workspace links open the existing product pages.

The tool inventory is generated on the server from
`GROWTH_CAPABILITY_ACTIONS` and `policyForGrowthTool`. It shows each advertised
action's consequences, approval requirement, idempotency, reversibility, undo
operation, and supported surfaces. Search and consequence filters apply locally.

## Adding a specimen

Add a synthetic result to `fixtures.ts` using an advertised capability and action.
Use the actual serialized output shape. Preview desktop, dock, phone, and both
themes. Keep real IDs, customer data, and provider credentials out of fixtures.
`fixtures.test.ts` checks that specimens use currently advertised actions.

Cards which start queries, poll jobs, or directly mutate services need an explicit
fixture adapter before inclusion. In particular, production-packet generation,
ranked-ad refreshes, and operation-job polling are omitted from this gallery.
The inventory still lists their canonical actions and policies.

Run `bun run check`, `bun test`, and `bun run ai:contracts` before shipping.
The gallery adds no model calls, new credentials, or schema changes.
