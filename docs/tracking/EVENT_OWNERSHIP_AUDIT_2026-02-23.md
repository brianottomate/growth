# Event Ownership Audit — Booking/Conversion Events (2026-02-23)

As-of date: **2026-02-23**

Related snapshots:
- `tracking/plans/segment-snapshots/2026-02-23T17-15-21Z/connections/`
- `tracking/plans/segment-snapshots/2026-02-23T15-54-35Z/` (tracking plans pull)

## Goal

Define a safe ownership model for conversion-critical events before enabling more Impact.com frontend/mobile flows.

## Executive Summary

1. `Order Completed` is emitted from all three surfaces today: web, mobile, and backend.
2. Backend is the strongest canonical sender for payable attribution because it has booking-confirmation state and richer attribution fallback logic (`im_ref`, `irpid`, `ipAddress`, `userAgent`).
3. Mobile has additional duplicate risk on `Payment Info Entered` from multiple code paths.
4. Impact configuration is split across three destination instances, including one still enabled on a deprecated source.

Conclusion: **stabilize ownership first (server canonical for payable conversion), then enable web/mobile Impact context paths.**

## Current Event Emitters (Code-Level)

### Order Completed

- Web client emit:
  - `wander.com/src/features/tracking/client/actions/trackOrderCompleted.ts:47`
- Mobile client emit:
  - `mobile/src/v3/screens/BookingSuccess/BookingSuccess.screen.tsx:185`
- Backend/server emit:
  - `wander/src/pms/bookings/module/src/events/booking-confirmed/send-segment-event.ts:31`

Backend send path details:
- Includes attribution params (`im_ref`, `irpid`, `ipAddress`, `userAgent`) and fallback logic:
  - `wander/src/pms/bookings/module/src/events/helpers.ts:265`
  - `wander/src/pms/bookings/module/src/events/helpers.ts:277`
  - `wander/src/pms/bookings/module/src/events/helpers.ts:402`

### Checkout Started

- Web client emit:
  - `wander.com/src/features/tracking/client/actions/trackCheckoutStarted.ts:27`
- Mobile client emit:
  - `mobile/src/v3/screens/BookingSummary/BookingSummary.screen.tsx:480`
- Backend/server emit:
  - Not found for this event in backend booking-confirmed pipeline.

### Payment Info Entered

- Web client emit:
  - `wander.com/src/features/tracking/client/actions/trackPaymentInfoEntered.ts:7`
- Mobile emits from multiple places:
  - `mobile/src/hooks/usePaymentSheet.ts:201`
  - `mobile/src/v3/screens/BookingSummary/components/PayForTrip.tsx:78`
  - `mobile/src/v3/screens/BookingSummary/components/footer/PayButton.tsx:51`

Observation: mobile likely over-counts this event unless these branches are guaranteed mutually exclusive in runtime.

### Order Cancelled (Adjustment Signal)

- Backend/server emit:
  - `wander/src/pms/bookings/module/src/events/booking-cancelled/send-segment-event.ts:50`

## Attribution Payload Notes

### Web

- Web track wrapper enriches all events with URL/cookie attribution including `im_ref` and `irpid`:
  - `wander.com/src/features/tracking/client/actions/track.ts:12`
  - `wander.com/src/features/tracking/helpers/getFullTrackingPayload.ts:27`

### Mobile

- Mobile Segment wrapper currently enriches with `adSource` only (not `im_ref`/`irpid`):
  - `mobile/src/services/segment.ts:29`

### Backend

- Backend `Order Completed` includes attribution from booking row + fallback from prior bookings when needed:
  - `wander/src/pms/bookings/module/src/events/helpers.ts:265`
  - `wander/src/pms/bookings/module/src/events/helpers.ts:286`

## Segment/Impact Destination State (from snapshot)

### Sources relevant to booking conversion

- `wander.com production` (`x84Wk3SxfkURdyYwKofHuu`)
- `Wander App Production` (`fykfWojrjAR75Y8gCnBugp`)
- `Wander API Production` (`bCMMVCHWyr45aCXrSg9TMg`)
- Deprecated: `Wander Server-Side API Production (DO NOT USE...)` (`3dZCtVvmTCESmNp24GSJpy`)

### Impact destination instances

1. `Impact - Server-side` (`689a6f6afb996ffd59300080`)
- Source: `Wander API Production`
- Enabled: `true`
- Action events: `Order Completed`
- Includes `ClickId <- properties.im_ref`

2. `Impact - Web Production` (`67b674dd31ff3d8563690ef9`)
- Source: `wander.com production`
- Enabled: `false`
- `enablePageEvents=true`, `enableIdentifyEvents=true`

3. `Impact` (`67aa7fe4752a7f754ba140d2`)
- Source: deprecated server-side source
- Enabled: `true`
- Action events include `User Signed Up`, `Checkout Started`, `Order Completed`
- Mapping differs from canonical server-side instance

## Ownership Matrix (Recommended)

- `Order Completed`
  - Authoritative sender: **Backend (`Wander API Production`)**
  - Client copies: keep for internal analytics only if needed, but must not be payable/Impact action signals.
  - Impact action ownership: backend only.

- `Order Cancelled`
  - Authoritative sender: **Backend**
  - Use for post-purchase quality/adjustment pipeline.

- `Checkout Started`
  - Authoritative sender: **Client (web/mobile)**
  - Purpose: funnel context, not payable conversion.

- `Payment Info Entered`
  - Authoritative sender: **Client (web/mobile)**
  - Mobile implementation should be deduped first.

## Recommended Next Steps (Execution Order)

1. Disable/remove Impact destination on deprecated source (`67aa7fe4752a7f754ba140d2`).
2. Keep `Impact - Server-side` as the only payable conversion sender.
3. Decide frontend conversion policy:
   - Option A: keep client `Order Completed` for analytics only (excluded from Impact action mapping).
   - Option B: remove client `Order Completed` sends entirely.
4. Audit and dedupe mobile `Payment Info Entered` path (three emit points).
5. Only after 1-4: enable `Impact - Web Production` for context (`Page`/`Identify`) if desired.
6. Re-run snapshots and diff against this report.

## Open Questions

1. Do we want client `Order Completed` at all once backend is canonical?
2. Should mobile have a dedicated Impact destination this phase, or only after event/schema cleanup?
3. Is `Checkout Started` intended to be an Impact action event anywhere? (current canonical server-side config says no)
