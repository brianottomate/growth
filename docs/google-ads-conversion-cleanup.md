# Google Ads conversion-action cleanup checklist

Generated 2026-07-13 from the live conversion-destination list (104 entries
across Demand / Supply / Sites / MCC). Zernio cannot rename or archive
conversion actions (list + upload only) and direct Google Ads API access is
blocked by the Workspace admin — so this cleanup is a one-time pass in the
Google Ads UI. MCC-owned actions mirror into child accounts; remove them once
at the level that owns them.

## 1. Remove — self-labeled dead (7 unique actions)

In **Demand (325-444-9027)** → Goals → Conversions:

- [ ] `Checkout Started_Segment_ARCHIVED` (#978141561)
- [ ] `Order Completed - GTM (Archived for deletion)` (#6887664218)
- [ ] `Checkout Started - GTM (Archived for deletion)` (#6887786340)
- [ ] `Checkout Started - Segment - Server Side 10/24 (Archived for deletion)` (#6914748656)

In **MCC (152-064-2156)** (these mirror into Demand + Supply — remove at MCC):

- [ ] `Order Completed - GTM - Client-side - MCC (Archived for deletion)` (#6972189001)
- [ ] `Wander Operated - Apply Today - GTM (Deprecated - Do Not Use)` (#6972258846)
- [ ] `Checkout Started - MCC (Archived for deletion)` (#6972264408)

## 2. Confirm with Brooke, then pick ONE set

Two parallel sets track the same five demand-funnel events:

| Event | Segment set (fired by wander.com typed provider — code truth) | GTM set ("Account Level - 10.9.25") |
|---|---|---|
| Purchase | #7137653171 | #7336153655 |
| Checkout Started | #7137653174 | #7336325499 |
| Checkout Previewed | #7341293237 | #7341189829 |
| Payment Info Entered | #7173278335 | #7336166846 |
| Signed Up / Account Created | #7186479311 | #7336140145 |

The Segment set is what `wander.com/src/features/tracking/lib/analytics.ts`
actually fires (house direction: typed code providers, no GTM). If the GTM set
was a migration backup, retire it; double-counting risk if both are primary.

- [ ] Ask Brooke which set is designated primary → retire the other.

## 3. Keep — ECL upload actions (automation targets)

`Payment Info Entered ECL GBQ` (#7214692481) and `Purchases - ECL from GBQ`
(#7215006600) are the natural targets for the automated conversion-upload
cron (replacing the manual BQ→Sheets→Google loop, see
`Payment Info Upload ECL Google BQ to Sheets 11-25` #7372244874).

- [ ] Longer term: 7 ECL variants exist (7-25, 10-25, 11-25 vintages) — once
      the automated upload lands, consolidate to one QUALIFIED_LEAD + one
      CONVERTED_LEAD action and remove the vintage experiments.

## 4. While you're in there

- [ ] Resolve the Supply AW-ID mismatch: site tag `AW-11418839359` vs
      conversion pool `AW-11520295109` (event snippets reference the pool).
- [ ] Check primary/secondary goal designation on the canonical Segment set —
      several were flagged "Needs attention" in the last account review.
- [ ] ~60 remaining legacy actions (Firebase app events, Smart-campaign
      call/direction clicks, YouTube engagement, old page-view Segment
      actions) are harmless but noisy — optional second pass.
