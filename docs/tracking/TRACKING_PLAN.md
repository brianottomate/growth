# Wander Tracking Plan

> Status: **Audit / WIP** — not enforced, not exhaustive yet
> Goal: Single source of truth for all analytics events across Wander's surfaces
> Last updated: 2026-02-23

---

## Segment Sources (Active)

| Source Name | Type | Workspace | Codebase |
|---|---|---|---|
| wander.com production | Website | WANDER_COM | `wander.com/` |
| wander.com staging | Website | WANDER_COM | `wander.com/` |
| Wander API Production | Server | WANDER_COM | `wander/` (backend) |
| Wander API Production (WanderOS users) | Server | WANDER_OS | `wander/` (backend) |
| app.wander.com production | Website | WANDER_OS | `app.wander.com/` |
| app.wander.com staging | Website | WANDER_OS | `app.wander.com/` |
| Wander App Production | Mobile | WANDER_COM | `mobile/` |
| Wander App Dev | Mobile | WANDER_COM | `mobile/` |
| Backfill HTTP API | Server | — | One-off backfills, no recent data |
| Wander API Dev | Server | — | No recent data |
| ~~Wander Server-Side API Production~~ | Server | — | **DEPRECATED — DELETE** |

**Two workspaces:**
- `WANDER_COM` — guest-facing (booking funnel, search, product views)
- `WANDER_OS` — host/operator-facing (app.wander.com, WanderOS platform)

---

## Naming Conventions

Two conventions in use — both intentional:

- **Segment e-commerce spec** (Title Case with spaces): Used for booking funnel events that map to Segment's native spec (`Order Completed`, `Checkout Started`, `Product Viewed`, etc.). Enables native integrations and CIO pre-built triggers.
- **Custom names** (Title Case with spaces, descriptive): Used for product-specific events in app.wander.com and the backend (`PMS Connection Success`, `Listing Selected`, `Domain Connected`).

No `snake_case` event names currently exist (mobile `trackEvent()` uses string literals matching the above).

---

## Cross-Surface Events (Same Event, Multiple Sources)

These events fire on more than one surface. Watch for double-counting in downstream tools.

| Event Name | Surfaces | Notes |
|---|---|---|
| `Order Completed` | wander.com (client) + wander backend (server) + mobile | **Triple fire risk.** Backend fires server-side after booking confirmed. wander.com and mobile fire client-side on success screen. Verify dedup strategy in CIO/Segment. |
| `Checkout Started` | wander.com (client) + mobile | Properties differ slightly — wander.com includes `similarUnits`, mobile does not. |
| `Checkout Previewed` | wander.com (client) + mobile | Same risk as above. |
| `Product Added` | wander.com (client) + mobile | |
| `Payment Info Entered` | wander.com (client) + mobile | mobile has `checkout_id` + `payment_method` only; wander.com has full product payload. |
| `Products Searched` | wander.com (client) + mobile | |
| `Product Viewed` | wander.com (client) + mobile | mobile uses `getPropertyV2SegmentPayload()` helper. |
| `Product Added to Wishlist` | wander.com (client) + mobile | |
| `Product Removed from Wishlist` | wander.com (client) + mobile | |
| `Coupon Entered` | wander.com (client) + mobile | wander.com includes `discount` + `coupon_accepted`; mobile only has `user_id` + `coupon_code`. |
| `User Signed Up` | wander.com (client) + mobile | Backend fires `Signed Up` (different name!) to WANDER_OS on WOS user creation. |
| `User Signed In` | wander.com (client) + mobile | |
| `Domain Connected` | app.wander.com (client) + wander backend (server) | app.wander.com fires client-side; backend fires server-side to WANDER_OS. Likely deduplicates but needs verification. |

---

## Events by Surface

### wander.com (Guest Marketing & Booking Site)
> Source: `wander.com production` · Workspace: `WANDER_COM`
> Implementation: `wander.com/src/features/tracking/client/actions/track*.ts`
> SDK: Segment (client-side) + Amplitude + Mixpanel

| Event Name | Key Properties |
|---|---|
| `Product Viewed` | product_id, sku, categories, name, brand, image_url, city, country, region, url, user_id, email |
| `Product List Viewed` | product_category, user_id, email |
| `Products Searched` | search_query, user_id, email |
| `Search Results Viewed` | results_count, search_filters, user_id, email |
| `Search Clicked Once` | type, metadata, user_id, email |
| `Search Started` | type, filter, ai_query, destination, user_id, email |
| `AI Search Follow Up Sent` | ai_query, metadata, user_id, email |
| `AI Search Started` | query, filters, destination, user_id, email |
| `AI Filter Search Started` | query, filters, destination, user_id, email |
| `AI Search Typed` | user_id, email |
| `AI Autocomplete Suggestion Clicked` | query, suggestion, ordinal, user_id, email |
| `Property Dates Selected` | product_id, check_in, check_out, user_id, email |
| `Property Dates Updated` | product_id, check_in, check_out, user_id, email |
| `Property Group Viewed` | groupTitle |
| `Product Added To Wishlist` | product_id, sku, categories, name, brand, image_url, city, country, region, url, user_id, email |
| `Product Removed From Wishlist` | product_id, sku, categories, name, brand, image_url, city, country, region, url, user_id, email |
| `Product Added` | cart_id, order_id, sku, category, value, currency, products[], checkin_date, checkout_date, user_id, email |
| `Checkout Previewed` | affiliation, categories, cart_value, checkin_date, checkout_date, coupon, currency, order_id, price, quantity, total, value, products[], user_id, email |
| `Checkout Started` | affiliation, categories, cart_value, checkin_date, checkout_date, coupon, currency, order_id, price, quantity, total, value, products[], user_id, email |
| `Payment Info Entered` | order_id, affiliation, payment_split, categories, cart_value, checkin_date, checkout_date, coupon, currency, quantity, total, value, products[], user_id, email |
| `Coupon Entered` | coupon_code, discount, coupon_accepted, user_id |
| `Order Completed` | affiliation, categories, checkin_date, checkout_date, coupon, payment_split, currency, order_id, price, quantity, revenue, total, value, products[], beforeGap, afterGap, guestInviteLink, tripLink, numberOfGuests |
| `Cancellation Reason Selected` | booking_id, reason, reason_text, trip_type, days_before_checkin |
| `Cancellation Abandoned` | booking_id, step_abandoned_at |
| `User Signed Up` | user_id, id_anonymous, source, customer_created_at, name, email |
| `User Signed In` | user_id, id_anonymous, source, customer_created_at, name, email |
| `User Signed Out` | _(none)_ |
| `Chat Opened` | user_id, email |
| `Book Live Clicked` | user_id, email |
| `Wander Guarantee Viewed` | listing_id, listing_name, user_id, email |
| `AI Trip Planner Property Card Clicked` | type, property_id, property_slug, ordinal, user_id, email |
| `AI Trip Planner Chat List Toggled` | from, to, user_id, email |
| `AI Trip Planner See More Search Results Clicked` | total, user_id, email |
| `App Attribution Flow Started` | adSource |
| `Clicked Sites Get Started` | user_id, email |
| `Submitted Sites Get Started Form` | form_id, response_id, user_id, email |
| `Clicked Sites Request PMS` | user_id, email |
| `Submitted Sites PMS Request` | form_name, form_email, form_phone, form_pms_name, form_number_of_units, user_id, email |
| `Clicked Sites Website Audit` | user_id, email, _(+ dynamic options)_ |

**Total: ~44 events**

---

### app.wander.com (Host / WanderOS Dashboard)
> Source: `app.wander.com production` · Workspace: `WANDER_OS`
> Implementation: `app.wander.com/src/services/segment/events/track*.ts` (~100 individual files)
> SDK: Segment (client-side) + Amplitude (experimentation)

#### Auth & Account
| Event Name | Key Properties |
|---|---|
| `Auth Viewed` | redirect |
| `OTP Requested` | email, redirect |
| `Logged In` | login_method, source, timestamp |
| `Logged Out` | logout_method, timestamp |
| `Signed Up` | sign_up_method, user_email, timestamp |
| `Account Settings Viewed` | timestamp |
| `Profile Viewed` | timestamp |
| `Profile Updated` | fields_changed, timestamp |
| `Profile Submitted` | full_name, organization_name, existing_website_url, success, error_message, timestamp |
| `Preferences Viewed` | timestamp |
| `Preferences Updated` | preference_name, old_value, new_value, timestamp |

#### Onboarding & PMS
| Event Name | Key Properties |
|---|---|
| `Onboarding Completed` | pms_name, timestamp |
| `PMS Selected` | selected_pms, timestamp |
| `PMS Credentials Submitted` | pms_name, timestamp |
| `PMS Connection Success` | pms_name, connected_pms, timestamp |
| `PMS Connection Failure` | pms_name, error_message, timestamp |
| `PMS Integration Changed` | previous_pms, new_pms, reason, connected_pms, timestamp |
| `PMS Sync Complete` | pms_name, number_of_properties_imported, timestamp |
| `Identity Verification Started` | pms_name, platform, timestamp |
| `Identity Verification Failed` | error_message, timestamp |
| `Organization Created` | organization_id, organization_name, user_id, timestamp |
| `Organization Creation Error` | attempted_org_name, error_message, timestamp |
| `Organization Name Updated` | previous_name, new_name, updated_by_user_id, timestamp |

#### Listings
| Event Name | Key Properties |
|---|---|
| `Listing Selected` | listing_id, listing_name, timestamp |
| `Listing Overview Viewed` | listing_id, timestamp |
| `Listing Settings Viewed` | listing_id, timestamp |
| `Listing Viewed on Site` | listing_id, listing_url, timestamp |
| `Listing Relisted` | listing_id, timestamp |
| `Listing Delisted` | listing_id, timestamp |
| `Listing Removed` | listing_id, timestamp |
| `Submit For Review` | listing_id, timestamp |
| `Action Required Viewed` | listing_id, issues_count, timestamp |
| `Issue Clicked` | listing_id, issue_id, issue_type, timestamp |
| `Overview Saved` | listing_id, timestamp |
| `Title And Description Tab Viewed` | listing_id, timestamp |
| `Amenities Tab Viewed` | listing_id, timestamp |
| `Amenity Added` | listing_id, category, amenity_name, timestamp |
| `Amenity Removed` | listing_id, category, amenity_name, timestamp |
| `Photos Tab Viewed` | listing_id, timestamp |
| `Photo Uploaded` | listing_id, room_name, file_name, timestamp |
| `Photo Deleted` | listing_id, photo_id, room_name, timestamp |
| `Photo Reordered` | listing_id, timestamp |
| `Location Tab Viewed` | listing_id, timestamp |
| `Permit Number Updated` | listing_id, previous_permit_number, new_permit_number, timestamp |
| `Reservations Tab Viewed` | listing_id, timestamp |
| `Reservations Filter Changed` | listing_id, filter, timestamp |
| `Reservation Opened` | listing_id, reservation_id, timestamp |
| `Reviews Tab Viewed` | listing_id, timestamp |
| `Review Replied` | listing_id, review_id, timestamp |
| `Listing Settings Viewed` | listing_id, timestamp |

#### Domains & Branding
| Event Name | Key Properties |
|---|---|
| `Domain Settings Opened` | timestamp |
| `Domain Connection Started` | domain, provider, timestamp |
| `Domain Connected` | domain, provider, timestamp |
| `Domain Verified` | domain, timestamp |
| `Domain Connection Failed` | domain, provider, error_message, timestamp |
| `Domain Removed` | domain, timestamp |
| `Brand Settings Opened` | timestamp |
| `Brand Settings Saved` | logo_uploaded, favicon_uploaded, title_updated, colors_updated, timestamp |
| `Brand Title Updated` | previous_title, new_title, timestamp |
| `Brand Colors Updated` | previous_color, new_color, timestamp |
| `Button Colors Updated` | button_type, text_color, background_color, timestamp |
| `Color Palette Updated` | preset_id, colors, timestamp |
| `Color Preset Selected` | preset_id, timestamp |
| `Logo Uploaded` | timestamp |
| `Favicon Uploaded` | timestamp |
| `Social Links Opened` | timestamp |
| `Social Links Saved` | x_updated, instagram_updated, tiktok_updated, facebook_updated, youtube_updated, timestamp |
| `Social Link Updated` | platform, previous_link, new_link, timestamp |

#### Billing & Subscription
| Event Name | Key Properties |
|---|---|
| `Billing Details Viewed` | timestamp |
| `Subscription Activation Started` | payment_provider, timestamp |
| `Subscription Activation Failed` | error_message, timestamp |
| `Subscription Modified` | previous_plan, new_plan, change_type, timestamp |
| `Subscription Cancelled` | cancellation_effective_date, reason, timestamp |
| `Invoice Viewed` | invoice_id, invoice_number, timestamp |
| `Invoices Page Visited` | timestamp |
| `Payment Viewed` | timestamp |
| `Payments Page Visited` | timestamp |
| `Payout Viewed` | timestamp |
| `Payouts Page Visited` | timestamp |

#### Team & Settings
| Event Name | Key Properties |
|---|---|
| `Team Member Added` | team_member_id, added_by_user_id, role, timestamp |
| `Team Member Removed` | team_member_id, removed_by_user_id, timestamp |
| `Contact Info Opened` | timestamp |
| `Contact Info Saved` | email_updated, phone_updated, timestamp |
| `Support Email Updated` | previous_email, new_email, timestamp |
| `Support Phone Updated` | previous_phone, new_phone, timestamp |
| `Property Manager Address Opened` | timestamp |
| `Property Manager Address Saved` | address_updated, timestamp |
| `Property Manager Address Updated` | previous_address, new_address, timestamp |

#### Campaigns
| Event Name | Key Properties |
|---|---|
| `Campaign Enabled` | campaign_name, previous_status, new_status, timestamp |
| `Campaign Disabled` | campaign_name, previous_status, new_status, timestamp |

#### Navigation / Other
| Event Name | Key Properties |
|---|---|
| `Reservations Visited` | timestamp |
| `Timeline Visited` | timestamp |

**Total: ~100 events**

---

### Wander Backend (Node/Fastify — `wander/`)
> Sources: `Wander API Production` (WANDER_COM) · `Wander API Production (WanderOS users)` (WANDER_OS)
> Implementation: `wander/packages/clients/segment/` · custom `@wosc/segment` wrapper
> SDK: `@segment/analytics-node` (server-side)

| Event Name | Workspace | Key Properties | Source File |
|---|---|---|---|
| `Order Completed` | WANDER_COM | affiliation, checkin_date, checkout_date, price, revenue, total, value, currency, order_id, nights, products[], booking_id, unit_id, numberOfGuests, beforeGap, afterGap, guestInviteLink, tripLink, UTM/FB/Google attribution params | `pms/bookings/.../booking-confirmed/send-segment-event.ts` |
| `Order Cancelled` | WANDER_COM | affiliation, checkin_date, checkout_date, price, reason, products[] (with city, country, nights, etc.) | `pms/bookings/.../booking-cancelled/send-segment-event.ts` |
| `Signed Up` | WANDER_OS | user_id, email, first_name, last_name, phone, property_count, direct_booking_url | `users/auth/.../upsert-os-user.ts` |
| `User Set Organizations` | WANDER_OS | organizationIds[] | `business-operations/organizations/.../invites/accept.ts` |
| `Domain Connected` | WANDER_OS | site_domain, organization_id, organization_name, user_id | `wos-saas/.../wander-sites-lifecycle.ts` |
| `Site Published` | WANDER_OS | site_domain, listing_count, organization_id, organization_name, user_id | `wos-saas/.../wander-sites-lifecycle.ts` |
| `New Influencer Booking` | WANDER_OS | unit_id, booking_id, property_name, property_slug, check_in, check_out, influencer_name, owner_note, social_media_urls | `growth/influencers/.../bookings/connect.ts` |
| `Influencer Booking 48h Reminder` | WANDER_COM | booking_id, property_name, check_in, check_out, influencer_name, influencer_email, guest_name, guest_email | `growth/influencers/.../crons/booking-reminder.ts` |
| _(betaTrack / Search)_ | Kafka only | total, page, hasMore, unit_ids, execution_time, search_filters, user_id, platform, coordinates | `growth/search/.../analytics.ts` → Kafka topic `{env}.product.trackSearch.v2` |

Also fires `identify()` calls on WOS user signup with full user traits.

**Total: ~8 server-side Segment events + Kafka search stream**

---

### Mobile (Expo / React Native — `mobile/`)
> Source: `Wander App Production` · Workspace: WANDER_COM
> Implementation: `mobile/src/services/segment.ts` · `mobile/src/analytics/`
> SDK: `@segment/analytics-react-native` + Firebase Analytics

| Event Name | Key Properties |
|---|---|
| `Product Viewed` | via `getPropertyV2SegmentPayload()` helper |
| `Product Added To Wishlist` | via `getPropertyV2SegmentPayload()` helper |
| `Product Removed From Wishlist` | via `getPropertyV2SegmentPayload()` helper |
| `Product Shared` | via `getPropertyV2SegmentPayload()` helper |
| `Product Added` | products[], cart_id, order_id, content_type, checkin_date, checkout_date, fb_content_type |
| `Checkout Previewed` | order_id, checkin_date, checkout_date, affiliation, total, value, currency, products[], similarUnits |
| `Checkout Started` | order_id, checkin_date, checkout_date, affiliation, total, value, currency, products[] |
| `Payment Info Entered` | checkout_id, payment_method |
| `Order Completed` | affiliation, order_id, currency, checkin_date, checkout_date, products[], coupon, revenue, total, value, beforeGap, afterGap, guestInviteLink, tripLink, numberOfGuests, campaignId, templateId |
| `Products Searched` | search_query, user_id, email |
| `Search Results Viewed` | results_count, search_filters, url, user_id, email |
| `Coupon Entered` | user_id, coupon_code |
| `User Signed In` | user_id, email, name, provider |
| `User Signed Up` | user_id, email, name, provider |
| `Review Dismissed` | id |
| `Product Reviewed` | reviewId, input |
| `Push Notification Tapped` | _(none)_ |
| `Deep Link Opened` | url |
| `App Attribution Flow Completed` | url, adSource |
| `Application Crashed` | error (JSON stringified) |

Auto-tracked by Segment SDK: app lifecycle events (open, background, foreground, install, update)

**Total: ~20 events**

---

## Analytics Surfaces

This plan should treat Segment and Amplitude as first-class, complementary layers:

- **Segment**: event collection, source routing, downstream delivery, and eventual tracking-plan enforcement.
- **Amplitude**: product analytics system of record for behavior analysis (funnels, pathing, retention, cohorting, conversion breakdowns).

Current state:

- We already have a strong Amplitude setup with working funnel analysis (example: booking conversion funnel from `Search Started` to `Order Completed`).
- We should design event schemas for both routing quality (Segment/CIO) and analysis quality (Amplitude funnel integrity).

Working rule:

- Define event names + property schema once in this tracking plan, then ensure all emitting surfaces conform.
- Funnel definitions belong in this document and should map to concrete events with required properties.

---

## Funnel Catalog (Draft)

Each funnel should have one owner and one canonical step event sequence.

### 1) Booking Conversion (`WANDER_COM`)

Step events:
- `Search Started`
- `Product Viewed`
- `Checkout Previewed`
- `Checkout Started`
- `Order Completed`

Primary KPI:
- Overall conversion rate and step-to-step dropoff rate.

Required properties:
- `platform`
- `order_id` or `checkout_id` (when applicable)
- `user_id` and/or `anonymous_id`
- `property_id` / unit identifier
- `checkin_date`, `checkout_date`

### 2) Checkout Completion (`WANDER_COM`)

Step events:
- `Checkout Started`
- `Payment Info Entered`
- `Order Completed`

Primary KPI:
- Checkout completion and payment-step dropoff.

Required properties:
- `checkout_id` (or `order_id` if checkout_id unavailable)
- `payment_method` (on `Payment Info Entered`)
- `currency`
- `value` / total amount

### 3) Search Quality (`WANDER_COM`)

Step events:
- `Search Started`
- `Products Searched` / `Search Results Viewed`
- `Product Viewed`

Primary KPI:
- Search-to-view quality by market/filter/date context.

Required properties:
- `search_query` or normalized search intent
- `search_filters`
- `results_count`
- `platform`
- `user_id` and/or `anonymous_id`

### 4) Wishlist to Booking (`WANDER_COM`)

Step events:
- `Product Added To Wishlist`
- `Checkout Started`
- `Order Completed`

Primary KPI:
- Wishlist-assisted conversion rate.

Required properties:
- `property_id` / unit identifier
- `user_id`
- `order_id` / `checkout_id` (downstream steps)

### 5) Post-Booking Health (`WANDER_COM`)

Step events:
- `Order Completed`
- `Order Cancelled`
- `Order Refunded` (currently missing; add if supported)

Primary KPI:
- Cancellation/refund rate by source, property, and market.

Required properties:
- `order_id`
- `property_id` / unit identifier
- `cancel_reason` or refund reason (when available)

### 6) Host Activation (`WANDER_OS`)

Step events:
- `Signed Up`
- `User Set Organizations`
- `Domain Connected`
- `Site Published`

Primary KPI:
- Activation rate and time-to-publish.

Required properties:
- `user_id`
- `organization_id`
- `site_domain`
- `listing_count` (for `Site Published`)

### 7) Inventory Readiness (`WANDER_OS`)

Step events:
- `Listing Created`
- `Listing Published` (or equivalent publish/availability event)
- First booking-intent event attributable to listing

Primary KPI:
- Time from listing creation to first demand signal.

Required properties:
- `listing_id`
- `organization_id`
- publish timestamp and attribution metadata

### 8) Marketing to Booking (`WANDER_COM`)

Step events:
- Marketing entry event (for example `sign_up_cta_clicked` where applicable)
- `Search Started`
- `Checkout Started`
- `Order Completed`

Primary KPI:
- Channel/source efficiency through to booking.

Required properties:
- `source` / campaign metadata
- `platform`
- `order_id` / `checkout_id` on downstream steps

### Funnel Governance Rules

- One funnel owner per funnel.
- One canonical event per step (avoid mixed client+server double counting unless deduped).
- Every funnel step must have required properties documented and validated.
- Run monthly funnel QA in Amplitude: event volume, property completeness, step-order integrity, and duplicate-rate checks.

---

## Listings as Segment Products

Wander listings map directly onto Segment's ecommerce product object. Each listing is a product; a booking is an order with one product in the array.

**Canonical product object for a booking:**

```json
{
  "product_id": "unit_abc123",
  "sku": "wander-tahoe-retreat",
  "name": "Wander Tahoe Retreat",
  "category": "Cabin",
  "brand": "Wander",
  "price": 450,
  "quantity": 7,
  "currency": "USD",
  "url": "https://wander.com/property/wander-tahoe-retreat",
  "image_url": "...",
  "checkin_date": "2026-03-15",
  "checkout_date": "2026-03-22",
  "nights": 7,
  "guests": 4,
  "city": "South Lake Tahoe",
  "region": "CA",
  "country": "US"
}
```

**Key modeling decisions:**

- `quantity` = nights (not number of units — there is always 1 listing per booking). This gives `price × quantity = total nightly spend`, consistent with Segment/Impact revenue math.
- `price` = nightly rate.
- `category` = property type (Cabin, Beach House, etc.) or market — decide one, apply consistently.
- `checkin_date`, `checkout_date`, `nights`, `guests` are custom extensions beyond the Segment spec. Segment passes them through; Impact ignores them unless explicitly mapped.

---

## Impact.com Integration (Current State + Plan)

### Current State

- `wander.com` frontend Segment source exists, but Impact.com destination is currently **disabled**.
- `wander` backend/server Segment source sends events (including conversion events like `Order Completed`) and Impact.com destination is **enabled**.
- Mobile Segment source exists, but there is currently **no Impact.com destination** configured.
- `im_ref` capture was recently improved in frontend + backend and is now piped into Segment.

### How Impact.com Works in This Context

For affiliate tracking, Impact only cares about two moments:

1. **Click captured** — `im_ref` stored on landing, tied to anonymous/user identity.
2. **Conversion** — `Order Completed` with `im_ref`, `order_id`, `revenue`, `userId`.

Everything in between (`Checkout Started`, `Product Viewed`) is useful for internal funnel analysis but not for Impact payouts. Keep Impact routing minimal: only send them the payable conversion event.

### Three Critical Issues to Resolve

**Issue 1 — Triple-fire is the highest-risk problem**

`Order Completed` currently fires from three places: wander.com (client), mobile (client), and wander backend (server). If Impact's destination is only enabled on the `backend_api` source, the client-side fires don't reach Impact — this is the safe state. **Verify this is actually true.** If Impact destination was ever enabled on `wander.com` or mobile sources, affiliates may have been credited or paid 3× per booking.

Action: confirm Impact destination is disabled on `wander.com` and mobile Segment sources. Do not enable it on those sources without an explicit dedup strategy using `order_id`.

**Issue 2 — Revenue field definition**

Impact needs to know the commission base. Three candidate fields exist on `Order Completed`:

| Field | Meaning | Use as commission base? |
|---|---|---|
| `revenue` | What Wander nets (post-fees, pre-tax) | Yes — standard for affiliate programs |
| `value` | Total cart value (what guest pays, pre-tax) | Possibly — higher, less accurate |
| `total` | Total including taxes | No — taxes are not commissionable |

Define this explicitly in the Impact destination mapping in Segment. Most programs use `revenue`. Confirm which field Impact is currently reading, and align the backend `Order Completed` payload to always populate it.

**Issue 3 — `im_ref` cookie lifetime and propagation**

The full attribution chain:

```
Affiliate link → wander.com?im_ref=xxx
  → stored in persistent cookie
  → user browses, comes back days later
  → books → backend Order Completed { im_ref: xxx }
```

Gaps to audit:
- Is `im_ref` stored in a **persistent cookie** (not session storage or memory)? Vacation bookings have multi-day consideration periods.
- Does the cookie survive checkout redirects?
- Is `im_ref` read client-side and passed to the server in the booking creation request, so the backend can include it in the server-side `Order Completed` payload?
- What is the cookie expiry window? Impact's standard attribution window is typically 30 days — match it.

### Attribution-Critical Fields

For commission attribution quality, the highest-priority identifiers are:

- `ClickId` in Impact.com, currently mapped from `properties.im_ref`.
- Stable conversion identifier (`order_id` / `orderId`) for dedup and payout integrity.
- Stable customer identity (`userId`, and email when available).
- `revenue` — the agreed commission base amount.

### Segment → Impact Mapping Notes

- Keep custom mapping: `ClickId <- properties.im_ref`.
- Also pass `context.referrer.type = impactRadius` and `context.referrer.id = <im_ref>` when available (recommended by Impact docs).
- Keep `OrderId` present on conversion events (`order_id` or `orderId` both supported by Impact's default mapping).
- Ensure `userId` is set on conversion events (`CustomerId` mapping).
- If email is only available in properties, map `CustomerEmail <- properties.email`.
- Product array: use **Custom Mapping for Products** if field names differ from Segment ecommerce defaults — do not use generic custom parameter mapping.

### Frontend vs Server Delivery (Decision Framework)

- Frontend delivery strengths: strongest page/open attribution context and native continuity from landing URL/referrer.
- Frontend delivery risks: duplicate counting when mirrored with server conversion events.
- Server delivery strengths: authoritative, payout-safe conversion tracking.
- Server delivery risks: attribution loss if click/user identifiers are not propagated consistently.

Recommended operating model:

- Use frontend (`Page`, optionally `Identify`) for attribution context capture only.
- Use backend/server as the sole sender for payable conversion events (`Order Completed`).
- Never route the same payable conversion from both frontend and backend to Impact without an explicit `order_id` dedup rule in Segment.

### Open Decisions

- Confirm Impact destination is disabled on `wander.com` and mobile sources (urgent — triple-pay risk).
- Align and document the commission base field (`revenue` definition and what it includes/excludes).
- Audit `im_ref` cookie persistence end-to-end (`clientCookies.ts` → booking request → backend payload).
- Whether to enable Impact destination on `wander.com` source for `Page` + `Identify` for better click attribution context.
- Whether to configure Impact destination for mobile source after mobile schema cleanup.
- Which events are officially payable in Impact beyond `Order Completed` (e.g. cancellation adjustments).

---

## Performance Marketing Roadmap

> Source: [Growth Marketing Roadmap + Creative Tracker](https://docs.google.com/spreadsheets/d/13FSW3r5-7SQltQiZmqdq6Bk5f8lkQBnJExH12uxngnY/edit?gid=1092679338#gid=1092679338)
> Last reviewed: 2026-03-10

### Marketplace

| Item | Readiness | Notes |
|------|-----------|-------|
| Comcast / TVSquared Tracking QA | **Ready to QA** | Destination middleware exists in `analytics.ts`, maps `order_id`, `revenue`, `coupon`, `productType` to TVSquared's camelCase field names. No code changes needed — just verify events are arriving in TVSquared. |
| Meta Pixel + CAPI QA | **Blocked by triple-fire fix** | CAPI is live server-side via Segment (`Wander API Production` source). Meta pixel is on wander.com. However the `Order Completed` triple-fire issue means conversion counts will be inflated. Fix that first, then QA. Also verify the deprecated Segment source (`Wander Server-Side API Production`) does not have a Meta CAPI destination enabled. |
| Google (All Firebase events) | **Needs clarification** | `gclid` / `_gcl_aw` are captured and forwarded on `Order Completed`. Google Ads Conversion API is active via Segment. If this means GA4 / Firebase Analytics for mobile, that's a separate surface — audit `mobile/` Firebase setup independently. Clarify with PM whether this is Google Ads conversions or GA4 event QA. |

### WanderOS

| Item | Readiness | Blockers |
|------|-----------|----------|
| OS Google Tracking *(once form off Typeform)* | **Not started** | Two sequential blockers: (1) WanderOS acquisition forms must move off Typeform onto a wander.com-hosted page so the Segment snippet fires on submission. (2) The `host-web` Segment source needs to be set up and the `/os` / `/listed` pages need `page_family` + `business_line` properties on their events. Google tag / Ads conversion action can be wired once the source exists. |
| OS LinkedIn Tracking | **Not started** | LinkedIn pixel is browser-only (no CAPI equivalent). Low engineering effort — add the LinkedIn Insight Tag to wander.com `/os` and `/listed` pages once the ad account structure decision is made (shared vs. separate from Marketplace). Segment has a LinkedIn Insight Tag destination that can be enabled on `marketplace-web` source scoped to those paths. |
| Instagram account for WanderOS | **Not an engineering item** | Brand / social decision. No tracking dependency. |
| LinkedIn — new ad account for WanderOS vs Marketplace | **Open decision** | CMO decision (open since last CMO doc). Determines whether LinkedIn pixel uses a shared account + scoped events, or a fully separate pixel ID. Blocks OS LinkedIn Tracking setup above. |

### What engineering can unblock now (no external decisions needed)

- Build `host-web` Segment source and add `page_family: 'os' | 'listed'` + `business_line: 'host'` to events on WanderOS acquisition pages — this is the prerequisite for all OS performance tracking
- Fix `Order Completed` triple-fire — prerequisite for Meta Pixel + CAPI QA being meaningful
- Delete deprecated Segment source — eliminates CAPI double-count risk
- Add `analytics.reset()` call on sign-out — Segment spec requirement, currently missing

---

## Known Issues / Red Flags

1. **`Order Completed` triple-fires**: wander.com (client), mobile (client), AND wander backend (server) all fire this event. Without deduplication in Segment, CIO and downstream tools see 2-3x booking events. Needs a `messageId` dedup strategy or one of the client-side fires removed.

2. **`Signed Up` vs `User Signed Up`**: Backend fires `"Signed Up"` to WANDER_OS (WOS hosts), while wander.com and mobile fire `"User Signed In"` / `"User Signed Up"` to WANDER_COM. Different names, different workspaces, different audiences — probably intentional but easy to confuse.

3. **`Domain Connected` double-fires**: app.wander.com frontend fires `Domain Connected` + wander backend fires `Domain Connected` server-side. Both go to WANDER_OS. Almost certainly duplicated.

4. **Mobile has zero type safety**: `trackEvent(eventName: string, payload?: object)` — any string is valid. All other surfaces have at least wrapper functions.

5. **`getPropertyV2SegmentPayload()` is a black box on mobile**: Several mobile events delegate their entire property shape to this helper. Need to audit what it actually sends.

6. **No central event registry anywhere**: app.wander.com has 100 individual files but no union type / enum that says "these are all the events." Impossible to know the full list without grepping.

7. **Deprecated source**: `Wander Server-Side API Production (DO NOT USE, GOING TO BE DELETED)` is still listed. Remove it.

8. **Search analytics via Kafka only**: Search tracking goes to `{env}.product.trackSearch.v2` Kafka topic, not Segment directly. It never reaches CIO or the standard analytics pipeline. This is likely intentional (high volume) but means search behavior is invisible in CIO segments.

---

## Identify / Traits

### WANDER_COM users (guests)
Called on sign-in from wander.com and mobile. Traits: `email`, `name`, `user_id`, `id_anonymous`, `source`, `customer_created_at`

### WANDER_OS users (hosts)
Called on WOS signup from wander backend. Traits: `email`, `first_name`, `last_name`, `phone`, `property_count`, `direct_booking_url`, `site_domain` (if exists), `organization_id`, `organization_name`

---

## Next Steps

### Impact.com (urgent — revenue attribution at risk)
- [ ] **Confirm Impact destination is disabled on `wander.com` and mobile sources** — triple-pay risk if enabled
- [ ] **Define and document the commission base** — is `revenue` = net of service fees, pre-tax? Align definition with Impact account team
- [ ] **Audit `im_ref` cookie end-to-end**: `clientCookies.ts` persistence → checkout redirect survival → passed in booking creation request → present in backend `Order Completed` payload
- [ ] Validate Impact custom mapping in Segment: `ClickId <- properties.im_ref`, `OrderId <- properties.order_id`, commission base field
- [ ] Confirm `im_ref` cookie TTL is 30 days (matching Impact's standard attribution window)
- [ ] Decide whether to enable Impact destination on `wander.com` for `Page` + `Identify` (attribution context only, not conversion)
- [ ] Decide whether/when to add Impact destination to mobile source (after schema cleanup)
- [ ] Determine if `Order Cancelled` should be registered as an action adjustment in Impact (commission reversal)

### Event Quality
- [ ] Resolve `Order Completed` triple-fire — document the intended dedup strategy (currently: source-level routing, Impact only on backend)
- [ ] Verify `Domain Connected` dedup story (client + server both fire to WANDER_OS)
- [ ] Audit `getPropertyV2SegmentPayload()` in mobile — document exact shape, verify it matches canonical product schema
- [ ] Ensure `revenue` field is populated on all server-side `Order Completed` events (distinct from `value` and `total`)

### Schema & Governance
- [ ] Add TypeScript event registry to mobile (`trackEvent<K>(event: K, props: Props[K])`)
- [ ] Add TypeScript event registry to wander backend (currently untyped string literals in some influencer events)
- [ ] Define canonical `WANDER_COM` product object schema (shared between wander.com and mobile)
- [ ] Expand YAML plan to cover all ~172 events with required properties
- [ ] Delete deprecated Segment source (`Wander Server-Side API Production`)
- [ ] Decide: should Kafka search events feed into Segment (via a consumer) for CIO segmentation?
