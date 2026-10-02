# Client page views and reusable setup links

Growth stays internal. Customer intake and Performance pitch pages stay on
wander.com and call Growth through the existing authenticated server gateway.
No customer Growth accounts or access-link table are introduced.

## Connections

Email DNS setup uses a 24-byte random base64url token, stored in the brand's
existing emailSender.marketingDomain JSONB, along with domain ID, creation and
expiry timestamps. This is a retrievable bearer credential, like the existing
Zernio connectToken, not a hash or signed payload. Authorized operators can copy
and resend it. Getting the link again preserves an active link for the same
domain; explicitly replacing it, changing domain, or expiry closes old access.
Legacy signed email URLs are removed, with no compatibility path. Email tokens
never unlock social setup. Deleted brands cannot resolve either setup flow.

`post` is the suggested subdomain, editable per brand. DNS setup does not change
senders, website routing, campaigns, or Customer.io. Social token URLs and OAuth
behavior stay intact. Connect responses suppress caching and referrers.

## Qualified views

The existing pregen /os beacon's three-second visible dwell is shared with the
Performance pitch and intake pages. Growth's email and social setup pages use
the same criterion. No backend render, link scanner fetch, or background-only
tab counts as a view. This filters common scanner traffic; it does not prove
human identity or perfectly detect bots.

A random visit ID is stored for that surface/resource in sessionStorage. A
successful beacon is recorded once per tab session, and only successful posts
mark the beacon as sent. Tracking is best effort; pages and setup remain usable
if measurement fails. `?noping=1` suppresses the beacon for operator previews.
Forwarded links cannot identify which individual viewed them.

Wander.com's server signs the resolved surface/handle before rendering a beacon.
The proxy validates that proof and same-origin request, then adds its gateway
bearer server-side. Growth re-resolves the live brand instead of accepting a
browser-provided brand ID. Tokens or signatures for one surface cannot be
substituted for another. Deleted/unknown brands do not create view records.

The new client_page_view table stores brand ID, surface, random visit ID and
server timestamp. A unique brand/surface/visit index makes retries idempotent.
It stores no raw credentials, names, IP addresses or browser fingerprints.
First/last view and counts are grouped from these events and shown on the
brand's Performance Setup page. The workspace-scoped brand.pageActivity API
returns the same summaries.

The existing pregen_build counters, owner assignment and Slack alert cooldown
stay unchanged. New Performance views do not send Slack notifications. Future
notification policy can consume the stored events without changing link access.

## Schema and deployment

`scripts/apply-client-page-view-schema.ts` applies only the additive table and
two indexes. It is exported through the Drizzle schema barrel. Existing pregen
data is neither moved nor rewritten. Development/preview and production share
a database today: apply the exact DDL deliberately, not an unrelated db:push.

Deploy Growth's endpoint before wander.com's beacon changes. The existing
GROWTH_GATEWAY_URL, API token and optional Vercel automation bypass are reused;
no new secrets are required. DNS Connect still needs Entri to allow its origin.

Viewing submissions or editing answers is not added here; the existing intake
privacy contract remains: slug pages disclose public brand details, token pages
can prefill contacts. A future private submission view needs a credential, not
just a slug. Reports can use the same qualified-view pattern later.
