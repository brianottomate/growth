# Demand sales → HubSpot

Demand-sales BDR lead routing (guest abandonment + signup events → a BDR's
queue) is moving from Outreach.io to HubSpot. This is the operator runbook for
the cutover and the design record for why it looks the way it does.

## Shape

Stage and BDR live on the HubSpot **Contact** as `demand_*` properties
("DEMAND - Stage", "DEMAND - BDR", …). There is no Deal pipeline. Supply-side
(PM / Sites) fields on the same Contact — `hubspot_owner_id`, `inbound_date`,
`inbound_outbound`, `bdr_for_rr` — are counted by the PM round-robin and are
never written from here; the `DemandContactProperties` type only admits
`demand_*` keys, which is what makes that a compile-time guarantee.

- **Phase 1 (this)**: contact-only, latest-wins. Parity with Outreach today.
- **Phase 2 (later, once Phase 1 is boring)**: a "User Events" custom object,
  one record per abandonment/signup episode keyed on
  `funnel_send_log (userId, stage, windowKey)`, associated to the contact.
  The `demand_crm_link` table already records the contact id it will need.

Everything upstream of the CRM write is unchanged: Amplitude →
`funnel_state` → sweep → `funnel_send_log` ledger → `processLead()`
(`src/server/services/sync.service.ts`) → BigQuery + Customer.io + Minerva
enrichment. Only the sink and the "who already owns this" lookup changed.

## Both CRMs, always

There is no switch. Every sync writes the Outreach prospect **and** the
HubSpot contact's `demand_*` properties (each half is skipped only if its
credentials are absent). Outreach is the system the BDRs work in today, so:

- **Outreach's owner is authoritative.** Owner precedence: existing Outreach
  owner → HubSpot `demand__bdr` (if it is someone Outreach can hold) →
  Customer.io `assigned_bdr_*` → rotation. A picker value or CIO email that
  maps to nobody in Outreach rotates rather than leaving the prospect
  ownerless. `findExistingDemandBdr` in
  `src/server/services/demand/bdr-assignment.service.ts` is the pure, tested rule.
- **A HubSpot failure never fails a lead while Outreach is configured.** It is
  recorded on `demand_crm_link.last_error` and `SyncResult.hubspotError`; the
  sweep counts it separately. HubSpot errors become fatal only if Outreach is
  unconfigured (HubSpot is then the only sink).
- **Reassigning in HubSpot sticks.** A person changing DEMAND - BDR fires the
  webhook, which mirrors the rep to Customer.io and moves the Outreach
  prospect's owner too — so the next sync sees the same owner in both. It
  can only do that for reps in `DEMAND_BDR_ROSTER` (they need an Outreach
  user id); for anyone else it records why and leaves Outreach authoritative.
- **Retiring Outreach** later is: remove `OUTREACH_*` from the env. The
  precedence rule then keeps off-roster reps by id/email, HubSpot errors
  become fatal, and the retirement PR deletes the code.

Rollback of the HubSpot half is a release rollback (re-run the last good
`Deploy` workflow, per CLAUDE.md) — there is nothing to flip.

## Files

| path                                                         | role                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/server/services/demand/field-mapping.ts`                | `LeadData` → `demand_*` payload; the property manifest                                |
| `src/server/services/demand/bdr-assignment.service.ts`       | roster (HubSpot owner ids), rotation, precedence                                      |
| `src/server/services/demand/hubspot-sink.service.ts`         | lookup (link table → search) and force-write (`updateContact`, never `upsertContact`) |
| `src/server/services/demand/owner-parity.ts` / `.service.ts` | `demand__bdr` change in HubSpot → Customer.io, with the `changeSource` loop guard     |
| `src/server/db/demand-schema.ts`                             | `demand_crm_link` — email ↔ HubSpot contact id, last error                            |
| `src/app/api/lab/cio-to-hubspot/route.ts`                    | dry-run harness + live roster check                                                   |
| `scripts/setup-demand-hubspot-properties.ts`                 | creates the property group + properties from the manifest                             |
| `scripts/apply-demand-crm-link-schema.ts`                    | idempotent DDL for the link table                                                     |

## Cutover

1. **Roster.** `GET /api/lab/cio-to-hubspot?roster=1` resolves each entry of
   `DEMAND_BDR_ROSTER` against live HubSpot owners. All four were invited and
   read active on 2026-09-14; re-check after any team change — rotation only
   hands leads to entries with a HubSpot owner id.
2. **Portal.** `bun run hubspot:setup-demand-properties --dry-run`, then
   without the flag. Needs `crm.schemas.contacts.write` on the Operated app.
   Then subscribe the app's webhook to `contact.propertyChange` on
   `demand__bdr`.
3. **DB.** `bun run db:apply:demand-crm-link` — or, without local secrets,
   `GET /api/lab/cio-to-hubspot?applySchema=1` on any deployment (same
   idempotent DDL). Production releases also create it via `drizzle-kit push`.
4. **Confirm the CIO attribute.** Templates read `assigned_bdr_email` /
   `assigned_bdr_name` / `assigned_bdr_outreach_id`. The last keeps its name
   and carries the HubSpot owner id once Outreach is gone; if a template
   renders it, rename or re-point that template before step 6.
5. **Verify.** On canary, run
   `/api/lab/cio-to-hubspot?email=…` on a few known guests, then let the
   sweep run. Compare `demand_*` on the contact against the Outreach
   prospect for the same `funnel_send_log` rows. Watch `demand_crm_link`
   for `last_error`.
6. **Prod.** `both` for a week, then `hubspot`. Delete the registered
   Outreach webhooks (`/api/outreach/webhooks`).
7. **Retire** (separate PR): the three CSV importers under `scripts/`
   (`import-abandoned-cart`, `import-checkout-incident`, `import-ota-guests`
   — port to the sink or delete), `webhooks/outreach-to-cio`,
   `outreach.router.ts` + its `root.ts` mount, `api/outreach/*`,
   `lab/outreach`, `lab/cio-to-outreach`, `outreach.client.ts` / `.types.ts`,
   `outreach/bdr-assignment.service.ts`, `outreach/field-mapping.ts` (move
   `LeadData` and the pure formatters next to the demand mapper first),
   `OUTREACH_*` env, the Outreach tier of `src/scripts/health-check.ts`.
   `cio:diagnose` / `cio:repair` get a HubSpot source.

## Monitoring after the merge

The release itself starts writing HubSpot. Three places tell you how it is
going, in order of effort:

1. **`GET /api/lab/cio-to-hubspot?status=1&hours=24`** (signed in, or
   `Bearer ADMIN_TOKEN`). One JSON document, no logs:
   - `link.syncedInWindow` — HubSpot writes in the window. Should track the
     sweep's Outreach `synced` totals; near zero with Outreach busy means the
     HubSpot half is dark.
   - `link.currentlyFailing` / `topErrors` — guests whose last attempt failed
     and the messages, most common first. Healthy is zero; a handful of 429s
     that clear on the next sweep is fine; anything mentioning a property
     name means the portal and manifest disagree.
   - `parity.outcomes` — how each `demand__bdr` webhook event was classified:
     mirrored, dropped as our own write, stale, off-roster rep, or not a guest.
   - `parity.pending` — should be 0 or draining; the hourly retry rail
     replays anything stuck.
2. **Vercel logs**, filtered:
   - `[DemandSync]` — one line per lead: `outreach=updated#id`,
     `hubspot=created#id` (or `FAILED` with the reason), owner and source,
     duration. The whole rollout in one grep.
   - `[FunnelSweep]` — per-stage `hubspot=written/failed` beside
     `synced=/failed=` every run.
   - `funnel_abandonment_sweep] Done` / `daily_comprehensive_sync] Done` —
     `hubspot N written / M failed` per run.
   - `[DemandSink]` — 409 duplicate-contact recoveries; `[HubSpot] … retry`
     — rate-limit backoffs (a few per run are normal, a wall of them is not).
3. **HubSpot itself** — a list on `DEMAND - Last Sync At` in the last day
   should grow through business hours; `DEMAND - BDR` should never be empty
   on a contact that has `DEMAND - Stage`.

What "rock solid" looks like before retiring Outreach: a week where
`failedInWindow` stays at zero apart from transient 429s, `syncedInWindow`
matches Outreach volume, and spot-checked contacts show the same BDR in
both CRMs.

## Property naming quirks

Three internal names differ from the `demand_<snake>` pattern because they
were created by hand and HubSpot derived the name from the label:
`demand__bdr`, `demand__note_2` (double underscore) and `demand_note_1`
(single). The manifest is the source of truth; never "fix" a name in the
portal, it cannot be renamed and the sync would start rejecting writes.
`demand_minerva_summary` and `demand_checkout_context` were created before
the Note 1 / Note 2 decision, are written by nothing, and can be deleted.

## Guarantees worth knowing

- The sink never uses `upsertContact`. That helper is fill-blank-only by
  design (it protects sales-edited fields); every `demand_*` property is ours
  to overwrite, so writes go through `updateContact`.
- `demand_stage`: a new contact → New Lead; `order_completed` closes any
  unbooked stage to Booked Direct (Outreach parity) but never rewrites a
  stage that already says booked (Booked / Booked Direct / Booked OTA), so a
  BDR-assisted booking is not re-attributed as direct; everything else is
  the BDR's.
- Our own `demand__bdr` writes echo back through the webhook with
  `changeSource` = `API` / `INTEGRATION` and are dropped; a rep's change
  (`CRM_UI`) or a HubSpot workflow's (`WORKFLOWS`) is mirrored to Customer.io.
- Repeat syncs go link table → `getById`, not CRM search, which is the shared
  5 req/s revenue-path budget (`docs/hubspot-gateway-plan.md`).
- Idempotent HubSpot calls (reads, updates) retry on 429/5xx inside the sink;
  creates never retry — a duplicate-contact 409 is turned into an update of
  the existing contact, recomputed against its real stage and rep.
- The HubSpot → Customer.io mirror only fires for contacts the demand sync has
  written (a `demand_crm_link` row exists), so setting DEMAND - BDR on a
  property-manager contact never creates a Customer.io person; and it applies
  the contact's _current_ picker value, so a replayed stale event cannot roll
  an assignment back.
- A HubSpot error (lookup or write) is recorded on `demand_crm_link.last_error`
  and the lead still counts while Outreach is configured.
