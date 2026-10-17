# Seed lists

A seed list is a brand's list of people for paid seeds. It is not a campaign
audience, an email list or a Meta object; a Meta platform plan delivers it.

## Model

One table, `seed_list`, one build per list:

- `origin`: the starting point that made it (template, persona, description or
  email list).
- `definition`: the filters the build ran over BigQuery; null for an email list copy.
- `members`: jsonb array of the people found, with the contact fields uploaded
  (email, E.164 phone, names, city, state, postal code, country).
- `member_count`, `summary` (candidates, evidence totals, people with an email
  or phone, phones) and `built_at`.

Refresh rebuilds a list in place. Templates run on today's homes and data,
persona and described lists reuse their filters, and an email list is copied
again. Meta keeps whatever was uploaded before; nothing syncs back.

`platform_audience.seed_list_id` links a Meta customer list to the list it was
uploaded from; a lookalike points at that customer list through
`parent_platform_audience_id`.

## Starting points

| Group | Template | People |
| --- | --- | --- |
| Your guests | `past_bookers` | Confirmed direct bookings on the brand's WanderOS site |
| Your guests | `email_list` | One of the brand's email lists, copied in |
| Wander travelers | `destinations` | Activity on homes in the brand's towns |
| Wander travelers | `similar_homes` | Activity on homes as big as the brand's, anywhere |
| Wander travelers | `persona` | A persona turned into home filters with AI |
| Wander travelers | `described` | A description turned into home filters with AI |

Evidence tiers: booked 100, checkout 80, dates 65, two or more views 45, one
view 25. Wander traveler templates keep people at 45 and above. About 1,000
people with an email or phone is a guideline for a useful lookalike: smaller
lists get a warning, never a block.

## Delivery

Wander's customers only reach Meta through Wander's ad account. A list with
Wander travelers uploads there, and only its lookalike reaches the client,
shared by hand in Ads Manager. A list of the brand's own guests uploads to the
brand's own pinned account, where its lookalike is already the brand's.

1. `seedWrite.build({ brandId, template, personaId?, steer?, emailListId?, name? })`
2. `seedWrite.upload({ seedListId, approved: true })` sends everyone with an
   email or phone in batches of 10,000. One pass: on failure the Meta list is
   marked failed and the operator uploads again, which creates a new Meta list.
3. `seedWrite.lookalike({ seedListId, seedPlatformAudienceId, approved: true })`
   builds a 1% US lookalike in the same account.
4. Wander's account only: `seedWrite.share({ seedListId, platformAudienceId, target? })`
   shares the lookalike (never the seed list) with the client's ad account
   through Meta's API (`POST /{audience}/adaccounts`, targeting only, using
   Growth's system-user token; Wander's business reaches the client account
   through its Leadsie partnership), records the client's own copy and attaches
   it when `target` is given. If Meta refuses, the share dialog still lists the
   IDs and a copyable computer-use prompt for Ads Manager; `confirmShared`
   records a share done by hand.
5. `seedWrite.attach({ seedListId, platformAudienceId, target })` links the
   client's copy to a campaign audience or persona; the push sends it as the
   ad set's custom audience.

Upload and lookalike creation need operator approval and never spend. In the
app, the ad set editor's "Seed lookalike" section runs upload, lookalike, share
and attach from one approval;
`/app/audiences` lists every brand's lists with the needs-sharing queue first.
