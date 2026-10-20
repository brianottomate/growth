# Influencer collections and partnerships

Performance → Influencers has Collections, Amplifiers and Partnerships tabs.

## Collections

A collection is an organization-owned `home_group` with ordered
`home_group_member` rows and an opt-in `home_group_share`. It can include active
homes from multiple client brands in the same organization. Existing brand-owned
groups retain their original owner, membership and editing boundary.

Operators filter by multiple clients, destinations and client home groups. Choices
within a filter are OR; active filter categories are AND. Destinations use the
brand's market identity and towns, not a new geographic taxonomy. Filters do not
change selected homes. Add all matching homes explicitly adds the full result
across catalog pages, up to 1000 homes.

The public `/home-groups/[token]` page is a read-only gallery with search,
pagination, home photos, locations and direct listing links. A collection can be
shared with many influencers. There is no recipient assignment, favorites, note,
date picker, reservation or login. Preferences and dates stay in email.

Collection cards expose Copy link, Open preview, Revoke link and Delete collection.
Editing a collection preserves its token and revoked links stay revoked. Renewal
creates a new token. Deletion removes a dedicated workspace group and its ordered
membership, never homes or contacts. Removing a legacy brand-group share keeps
that brand's group and membership intact.

Tokens use 32 random bytes. Public reads re-check current organization ownership
and client eligibility in one SQL snapshot. Public output excludes contact details,
client identities and internal IDs. Home keys are token-scoped HMACs. Public pages
use no-store, noindex and no-referrer, bypass login, and suppress analytics for
share paths and referrers. Anonymous response writes no longer exist.

## Amplifiers

Amplifiers are organization-owned contacts. Create requires a name with one
optional platform/handle pair. Editing supports multiple handles, email, phone,
notes and handoff preferences. This surface never creates or links a brand.
Deleting a contact soft-deletes it; historical partnerships remain, while its
active partnership cards stop offering a link.

## Partnerships

`influencer_partnership` owns one collaboration's identity: organization,
amplifier, client brand, optional home, optional stay dates, deliverables and
internal notes. Repeated collaborations between the same parties are distinct
records. Every selected home must belong to the selected client. All readers and
writers enforce live workspace access through the shared action runtime.

The destination is derived from the selected home's stored listing URL, or the
client website when no home is selected. Canonical paths retain no stale booking
query parameters or dates. Tagged URLs use `utm_source=influencer`,
`utm_medium=partnership`, `utm_campaign=wander_performance` and
`utm_id=<partnership ID>`. Names can change without changing attribution identity.
Stay dates are internal context and are not written into promotion links.

Copy tracking link and Open destination are available after saving. Invalid,
missing, deleted or cross-client destinations have a visible readiness issue.
Soft deletion removes the partnership from active lists and retains its identity
for historical attribution; already copied tagged links still visit the booking
site. No tracking redirects, email sends or bookings are created by these actions.

Chat and MCP expose `influencerRead__partnerships`,
`influencerWrite__savePartnership` and `influencerWrite__removePartnership`.
They use the same service actions as the UI. Sparse updates preserve omitted
fields; null clears an optional field. No timestamp conflict guards or synthetic
brands/campaigns are needed.

## Migrations and validation

The earlier unshipped feature migrations were resequenced after current dev as
0048; production migration history is unchanged. 0049 introduces partnerships and
removes obsolete collection-recipient and response state. Existing collection
IDs, membership, ordering and share tokens survive the simplification. Amplifier
email and phone remain.

The database acceptance harness applies the real feature migrations in PGlite and
checks tenant isolation, public projection, revocation, deletion, brand-group
reuse and partnership identity, sparse updates, destination/date validity and
history retention. Forward migration rehearsal also passed on a fresh Neon copy
of production. The local feature server uses the named experiment database;
production migrations run only through the standard release deployment.
