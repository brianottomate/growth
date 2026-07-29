# Osano trial + banner styling — handoff

_Last updated 2026-07-27. Owner: Kristian. Companion: [consent-workstream-handoff.md](./consent-workstream-handoff.md) (§3 vendor eval)._

Hands-on Osano trial: the vendor's Cookie Consent banner running on real Wander surfaces, to evaluate **Option B** (Osano's banner, we consume the signal, our engine enforces). Option A (Unified Consent + our own banner) is the parallel track.

## Access
- Console: `my.osano.com`. **The `?st=...` in shared URLs is a live session token — do not paste it into shared or logged places.**
- Config: **"wander.com (trial / preview eval)"**, id `tTjIvSmk3K/7bd89e05-837c-4d63-9c89-776ca383eebd`.
- Install snippet:
  ```html
  <script src="https://cmp.osano.com/tTjIvSmk3K/7bd89e05-837c-4d63-9c89-776ca383eebd/osano.js"></script>
  ```

## Config state
- **Compliance Mode: Permissive** (banner shows, Osano does NOT block; our engine enforces). Never set Strict — its blocker cannot see our bundled ES-module SDKs, so it would add a second opaque source of truth for zero enforcement gain.
- **Domains**: `wander.com` + the #3206 preview host. Osano gates rendering by domain, so any new host must be added here.
- **Advanced Settings**: `First Layer Categories` **OFF** (category toggles move off the banner into the drawer, the Kindred pattern), `Add Manage Preferences Button` **ON**, GPC **ON**, Google Consent Mode **ON**.
- **Styles**: Banner Type **Box**, Wander-dark palette. Published.

## Where the script is injected
| Surface | Gate | State |
|---|---|---|
| wander.com ([#3206](https://github.com/wandercom/wander.com/pull/3206)) | `VERCEL_ENV === 'preview'` | pushed, banner verified live |
| WanderOS sites ([#826](https://github.com/wandercom/wander-sites-website/pull/826)) | `PUBLIC_OSANO_CONFIG_ID` env var, **unset by default** | pushed |

The WanderOS gate is an env var rather than a `PROD` check on purpose: with ~800 merchant domains a code-level gate is too blunt, so the vendor script ships on **no** merchant domain unless a deploy explicitly opts in. The tag is visitor-invariant, so it does not vary the shared SWR HTML cache.

## The bridge: Osano -> our engine
[tracking#69](https://github.com/wandercom/tracking/pull/69) adds the adapter that was the missing link. Without it, Osano's banner and our engine run as two independent, unsynced consent states (observed live).

- `mapOsanoConsent` (**core**, pure + unit-tested): `ANALYTICS → analytics`, `MARKETING → advertising`, `PERSONALIZATION → functional`, `ESSENTIAL → essential`.
- `subscribeToOsanoConsent` / `readOsanoConsent` (**web**): read the live decision and react to changes. Feed the callback into `updateConsent()` and each change re-runs the boot plan, so SDKs load or stay unloaded.

Two non-obvious details, both encoded and tested:
- **`OPT_OUT` is inverted from intuition.** `ACCEPT` means the visitor HAS opted out of sale/sharing (vendor-confirmed), so it forces `advertising` off and can only ever remove permission. Both `OPT-OUT` (docs spelling) and `OPT_OUT` (what the live CMP returns) are read — the discrepancy would otherwise silently drop the do-not-sell signal.
- **`STORAGE` is deliberately unmapped** while its semantics are unconfirmed, and a missing/malformed object yields `ALL_OFF`. Both fail closed. **Open question for the vendor session.**

Registration uses Osano's pre-load command queue (`window.Osano(...)`), not `addEventListener`, because osano.js loads async and a late listener misses the first decision.

## Verified live on the preview
- Chain works end to end: config → script → banner.
- **Geo is real**: `jurisdiction: no-03` (Norway egress) + `gdprApplies: true` → correct GDPR opt-in banner, all categories DENY by default. EEA + UK are one bucket, so France behaves identically to Norway.
- **Two banners coexist** (ours + Osano's) as unsynced states — exactly what tracking#69 closes.
- Pre-existing tracker cookies were a prior accept-all `wander_consent` (our engine honoring a stored grant), **not** a leak.
- Osano's `osano_consentmanager_tattles` shows it detecting GTM/Clarity/Bing/Twitter/Segment but listing most as already-executed, confirming it cannot gate our bundled trackers.
- **No shadow DOM** — Osano renders in light DOM with `.osano-cm-*` classes, so custom CSS can reach it if console styling is ever insufficient.

## Styling notes
Console-first: native controls cover all colors plus the Box layout; CSS only for last-mile polish.
- Colors live in **Styles → Colors**. Click a swatch → a picker opens with a **Hex field** → type the hex.
- Banner groups: Default (Background `#111111`, Text/Link `#FFFFFF`), Toggle Off (`#3F3F46` / indicator `#FFFFFF`), Toggle On (`#FFFFFF` / indicator `#111111`), Buttons (`#FFFFFF` bg, `#111111` text, hover `#E5E5E5`).
- **Per-type Buttons** (Accept/Deny/Manage/Reject All): leave blank, they inherit the general Buttons colors. We want equal-weight pills.
- **Drawer**: set it to match the banner, otherwise the preference center falls back to Osano's light defaults and clashes.
- Publishing takes up to ~15 min to hit the CDN and `osano.js` caches hard — hard-refresh and clear `osano_consentmanager*` before concluding a change did not land.

## Vendor answers (Martin, 2026-07-28) — settles most opens
- **Styling:** visual-only theming fine; substantive changes (removing buttons, altering choice architecture, changing default copy, Accept > Reject prominence) risk the guarantee. Do NOT remove the X without Osano review. Preferences/Save as secondary weight explicitly OK. **Hiding the cookie widget + footer link = explicitly acceptable** (their documented pattern). Loop in their privacy team before major changes.
- **CMP records: no programmatic export, confirmed.** Console Consent Search (by UUID/external ID) + aggregate Reporting only. Person-level programmatic records = Unified Consent's role.
- **CMP banner writing into UC as its records store: "not a confirmed pattern yet."** So banner+guarantee+UC-records as one chain does not exist today. Tiebreaker for A vs B: whether our own `Consent` table + CMP console search satisfies audit needs.
- **STORAGE = IAB TCF 2.0 storage signal**, defaults DENY when TCF is off (ours is). Vendor endorses leaving it unmapped — the adapter's fail-closed choice is now vendor-confirmed (tracking#69's "unconfirmed" comment can be softened when next touching the file).
- OPT_OUT: ACCEPT = visitor opted out (re-confirmed). CMP pricing tiers in their Sales Room.

## Open items
1. Finish the accept/reject round-trip test (confirm Osano logs a certified record; check `getConsent()` flip + Reporting).
2. Confirm `STORAGE` semantics and whether a **consent-change webhook** exists (would let the server receive decisions without ever reading Osano).
3. Our own ConsentBanner renders light/cream on a light-theme page rather than Wander-dark — verify whether the dark revert regressed.
4. Decide the ~800-domain topology with Osano: one config hosted on many domains vs per-merchant configs provisioned from a template via the Consent Manager API. Note `Cross Domain Support` must stay **off** (each PM is its own controller) and the Privacy Policy URL accepts relative paths, which is what makes one shared config even thinkable.
5. **Before #3206 / #826 merge**: strip the trial script and the wander.com dev harness. The env/`VERCEL_ENV` gates protect prod at runtime, but the code should not ship.

## Gotchas
- Heavy restyling of Osano's banner is the kind of change the no-fines pledge excludes ("changing button size/text"), which erodes Option B's guarantee edge. Not a blocker (we do not lean on the guarantee) but worth knowing.
- Osano ships four distinct products with different APIs — Cookie Consent (CMP, `window.Osano.cm`), the deprecated open-source `cookieconsent` lib, Consent Prompts, and Unified Consent. Do not conflate them when searching docs.
