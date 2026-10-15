# Sites bookings for Performance

Only the Sites Amplitude project (767045) forwards `Order Completed` to Growth. Marketplace reporting stays in Amplitude. The existing Marketplace funnel receiver and abandonment workflow are unchanged.

## What happens to a booking

1. Authenticate with the existing `CUSTOMERIO_WEBHOOK_BEARER_TOKEN`. `AMPLITUDE_INGEST_ENABLED` defaults to false.
2. Validate Amplitude's default payload, project, server/production envelope, booking ID, website ID, property ID, currency and amounts. UTC timestamps without an offset are normalized explicitly. Guest bookings do not need a user ID.
3. Resolve the website through `brand.wanderOsWebsiteId` to a non-deleted Performance account in the brand's Growth organization. A missing or ambiguous customer is acknowledged and discarded. Never guess by email, domain or property name.
4. Inspect event, current user, `last_` and `initial_` attribution separately. Retain candidates with Meta, email or ChatGPT signals, including a Facebook click ID or email medium alone. A matched customer without those signals is acknowledged and discarded.
5. Insert one `performance_booking` keyed by the backend booking ID, initially `possible`. The record contains selected attribution evidence, not the raw event or guest contact details. Persistence failures return 503 for retry; repeated delivery cannot duplicate or reassign the booking.
6. Schedule deeper classification through Next.js `after()` and acknowledge the request. The classification checks our managed campaigns and sent messages. Failure leaves the durable booking as possible with a null `classifiedAt`; `classifyPerformanceBooking(bookingId)` can be called again. Slack alerts reuse the existing workflow-run queue and its never-started-job recovery. There is no new cron.

## Attribution meaning

- **Possible:** a relevant signal, such as `fbclid`, Meta source, email medium, ChatGPT source/referrer or a known campaign name. Initial acquisition evidence remains possible, even when its ID matches.
- **Confirmed:** an exact campaign ID matches a Growth-planned Meta campaign for that brand or a campaign assigned to that customer's Performance cycle; or an exact message-send ID matches a sent email for that brand before the booking. Matching remains scoped to the client. Confirmation means a recorded touch matches our campaign, not proof of incremental causation or last-click credit.

The current Meta link helper sends campaign/ad **names**, and newsletter links use title-derived campaign slugs. Those links usually produce possible attribution. Stable identifiers must reach Amplitude before these paths can confirm an exact match. This PR does not change outbound tagging or invent identifiers. It also does not fetch user history from Amplitude or assume its channel classifier is included in the payload.

## Business data

`performance_booking` stores the backend booking ID, account, website/property, confirmed time, stay dates, currency, total/revenue, selected attribution, confidence and evidence. Amounts use the Sites producer's major currency units. There is no generic Amplitude event table and no Marketplace ingestion endpoint.

Only `Order Completed` is supported in this first slice. These are candidate gross bookings, not net revenue: cancellation/refund handling and integration into report aggregation remain follow-ups. Published Performance reports are not modified. No lifecycle enrollment, email delivery or ad conversion is triggered.

The additive `0031_performance_bookings` migration shipped in production release `v1.0.375` on 2026-10-15. The previous unshipped Amplitude event-storage migration was removed.

## Configuration and rollout

Use [destinations.json](./destinations.json) as the exact worksheet, not as an Amplitude API request:

- Sites destination: `Growth Performance - Sites bookings` (30174927), **enabled** on 2026-10-15.
- URL: `https://growth-red.vercel.app/api/workflows/amplitude-sites-order`.
- Default event payload; only `Order Completed`; Send Users off; Status Enabled.
- Reuse the existing bearer value in `CUSTOMERIO_WEBHOOK_BEARER_TOKEN`. No new secret or token rotation is required.
- Production has `AMPLITUDE_INGEST_ENABLED=true`. A synthetic non-client connection test returned `not_performance_client`, verifying delivery, authentication and the client lookup without inserting a booking.

An earlier Marketplace draft, `Growth Attribution - Marketplace (storage only)` (30174921), remains disabled without credentials. It is obsolete and must not be enabled; its proposed receiver was removed. Existing operational destinations were not changed.

## Producer readiness

Current Wander backend `dev` already calls the Sites `Order Completed` emitter for confirmed `GENERATED_WEBSITE` bookings. `trackSitesEvent` adds `website_id`, `org_id`, `event_source=server`, environment and browser journey context. This Amplitude path is independent of the open Meta CAPI PRs #22065/#22137. This is code evidence, not confirmation of production delivery or complete historical coverage.

## Validation

Focused tests cover project/source validation, guest purchases, authentication, failed persistence before acknowledgement, real migration/insert behavior in local PGlite, duplicate bookings, cross-customer isolation, ambiguous ownership and attribution confidence. No live events or emails were sent. Full repository checks are recorded in the PR.


## Booking alerts and ChatGPT referrals

Retained Performance bookings notify `#team-performance` through the same Slack bot
and workflow-run claim used by intake and stage handoffs. Classification runs first
in `after()`, then the alert shows possible/confirmed Performance attribution,
client, total, booking ID, stay dates, signal channel/scope/kind and a client link.
No guest details, raw click IDs or referrer URLs are included. Non-production sends
use the shared client's testing-channel redirect.

One workflow identity per booking and confidence prevents repeated alerts from
Amplitude retries, even after a successful workflow completes. A later promotion
from possible to confirmed can notify again. Never-started queued alerts use the
existing recovery path; failed/running provider calls are not automatically replayed
because delivery may already have happened. Their status is visible in client
workflow activity. If classification fails, the saved possible booking can still
alert with matching marked incomplete.

`utm_source=chatgpt.com` (documented by [OpenAI](https://help-lb.openai.com/en/articles/12627856-publishers-and-developers-faq)),
explicit `chatgpt` source, or a referrer/referring domain on `chatgpt.com`,
`www.chatgpt.com` or `chat.openai.com` is a ChatGPT signal. Match parsed hostnames,
not substrings. Event/current/last/initial scopes are preserved. ChatGPT-only
bookings stay possible: referral evidence does not establish Performance influence.
This covers tagged/referring visits, not invisible direct visits or an automatic
claim that an AI agent made the booking. No additional Amplitude filter is needed.
