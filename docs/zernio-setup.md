# Zernio setup for the growth workspace

Use one Zernio workspace owned by Boe Ventures AS and one API key in
`ZERNIO_API_KEY`. A the growth workspace `brand` maps to one Zernio profile through
`brand.zernioProfileId`; a the growth workspace `channel` maps to an actual connected social
account through its `externalId`.

This keeps billing, credentials, and rate limits in one place while retaining a
clear operating boundary for every brand. Do not add profile or account IDs
until they are visible in Zernio.

| the growth workspace brand | Type | Zernio profile | Initial connected accounts |
| --- | --- | --- | --- |
| Kristian Boe | personal | `kristianeboe` | LinkedIn, Instagram, X |
| Homi | company | `homi` | Instagram, X, Facebook, LinkedIn, Meta Ads |
| SwipeStats | company | `swipestats` | Instagram, X |
| Hydra | company | `hydra` | X |
| the growth workspace | company | `growth` when needed | none initially |
| ProMad.life | company | `promad-life` when needed | none initially |

## Connection procedure

1. In Zernio, create or confirm the named profile inside the single Boe
   Ventures workspace.
2. On `/app/brands`, choose **Import from Zernio** and select the profiles to
   create as owned brands. Existing assignments are shown and cannot be chosen
   twice.
3. the growth workspace saves the profile ID to `zernioProfileId` and imports each connected
   account as one channel. The importer sets:
   - `kind`: `social` for social profiles, `ad` for Meta Ads.
   - `platform`: the actual network.
   - `externalId`: the Zernio connected-account ID.
   - `defaultProvider`: `zernio`.
   - `connectionStatus`: `connected` only after a successful read from Zernio.
4. Reopen **Zernio connected** on a brand to refresh accounts after changing
   connections in Zernio.
5. Verify a content-sync call with an explicit brand slug. It must never infer
   a default brand or resolve an account by platform alone.

## Guardrails

- Keep the API key only in the the growth workspace environment; do not save it per brand
  or per channel.
- A profile is organizational context, not an account. A connected account is
  the publishable destination and must remain unique to its brand.
- Database constraints prevent a Zernio profile from being assigned to two
  brands and a Zernio connected-account ID from appearing on two channels.
- Sync requests include both the brand profile ID and exact account ID. Results
  are attached only when `channel.externalId` matches; platform-only matching is
  forbidden.
- If a future brand requires legal, billing, or access isolation, give it a
  separate Zernio workspace/key and model that as a deliberate multi-workspace
  extension—not as a second profile.
