# CMP vendor evaluation — Osano / OneTrust / in-house (WIP)

Status: **active**, last updated 2026-07-21. Owner: Kristian (eng), Lauren Vargo (scoping doc / vendor relationship).
Next checkpoint: **Osano solutions-engineer call Wed 2026-07-22** (Martin Horak, AE, is the contact — martin.horak@osano.com).

Purpose of this doc: single place any agent/human can pick up the vendor evaluation without re-deriving it. The
consent *implementation* is documented in `tracking/docs/consent-architecture.md` (currently on the
`feat/consent-web-engine` worktree branch of the tracking repo, tracking#55/#56). This doc covers the buy-vs-build
program: decisions of record, vendor facts with sources, and the open contract questions.

## Decision of record (2026-07-15, CEO closed the thread)

- **Osano-as-partner hybrid**: vendor = policy layer (jurisdiction rule matrix, translations, consent-record vault,
  GPC), Wander = enforcement (init gating, categories, server gating, WanderOS per-site). Jeremy's winning argument
  was **regulator optics**, not liability ("industry-standard tooling is the cheapest proof of good faith").
  CEO directive: "execute on whatever is industry standard, keep code surface area as low as reasonable, UI/UX as
  clean as possible relative to requirements" — and "limit the ugly" on banners.
- The in-house enforcement train (6 PRs: tracking#55/#56, wander.com#3206, app.wander.com#1425, wander#20620,
  wander-sites-website#826) ships regardless and gates the **August WanderOS EU launch**. No vendor can replace it
  (CMP auto-blocking cannot see npm-bundled SDKs). Vendor onboarding must NOT be on the launch critical path —
  the in-house banner is the shipping default; a CMP swaps in behind `updateConsent()`.
- Auto-blocking stays **OFF** in any vendor deployment. One enforcement layer: ours.

## The headless collision (THE open question)

Plan-of-record assumed our banner + our engine, vendor as brain/vault. **Osano's AE stated in writing (recap email
Jul 17)** that their JS API is *"built for reading/reacting to consent, not for a fully custom-built banner that
writes consent back to Osano"* — i.e. their "headless" = **their banner decides + records; our code reads state and
listens for consent-change events**. A custom banner cannot write into their vault.

- **OneTrust CAN do write-back**: server-side CMP API `POST /cfw/cmp/v1/save-log-consent` accepts decisions from a
  custom UI and returns a JWT consent receipt. Docs: https://developer.onetrust.com/onetrust/docs/save-and-log-consent
  (verified 2026-07-21). This is the capability benchmark to hold Osano to ("this or better").
- Fallback shape that still works with Osano (and is arguably the guarantee-safest): **their banner + their vault on
  wander.com/app.wander.com** (styled to the Kindred reference — must pass the CEO ugly-test; demand a live styled
  demo before signing), our engine subscribes to their events → maps their categories to our four
  (essential/functional/analytics/advertising) → `updateConsent()`. WanderOS stays fully in-house either way
  (per-host controllers; their "cross-domain consent sharing" feature must be OFF for wos hosts).
- If we buy: actually deploy it. Shelf-ware Osano ("you had it and didn't deploy") is worse in discovery than not buying.

## Osano facts (sales room + email, captured 2026-07-21)

Source docs in ~/Downloads (Kristian's machine): `Osano Business Case Deck for Wander (1).PDF`,
`wander.com-scan-33472.PDF`, `Osano Basic Privacy Bundle (3)(11).PDF`, `Osano_Audit_Defense (1).PDF`,
`Osano_vs_OneTrust-ConsentManagment.PDF`.

- **Pricing**: Basic Privacy **$16,250/yr, 24-month term**, one-time implementation fee $2,500 ("50% waived from
  $5,000"). Pricing slide says **750K monthly unique visitors**; implementation slide says **250K** — contradiction,
  get the real cap + overage pricing in writing. DSAR capped at 5/month. Compliance Check = **3 domains, 1
  scan/domain/month**.
- **Guarantee**: deck wording is "$500K guarantee on **out-of-box configs**". Assume void in headless/custom
  configurations until Osano states otherwise in writing. (Their ToS disclaim liability generally; the guarantee is
  a conditional warranty, not indemnification — established in the Jul 13-15 analysis.)
- **Deck sloppiness** (leverage): two slides recycled from another prospect ("How This Helps The Randall Group",
  CIPA/financial-advisors slide). Their guided-implementation plan describes THEIR script moving the site
  "permissive → strict mode" (their blocking model) — contradicts our auto-blocking-OFF requirement; implementation
  plan needs a headless rewrite before signature.
- **Their compliance scan of wander.com** (Jul 17, California region, 3/5 fail) found real pre-train issues, all
  verified live on Jul 21 and all fixable without any vendor:
  1. **GPC not honored**: Consent Mode grants ad_storage/ad_user_data/ad_personalization with GPC on (gcs=G111,
     npa=0); `_gcl_au`/`_fbp`/`_rdt_uuid`/`_ttp` + ~30 trackers active. Live CCPA/CPRA obligation TODAY → map
     GPC→reject for CA in wander.com middleware (#3206 already lists GPC as follow-up).
  2. Privacy policy has **no visible "Last Revised" date** though its own text promises one.
  3. **No `/.well-known/gpc.json`** (URL falls into a catch-all referral redirect). Serve `{"gpc": true}` once GPC
     is actually honored.
  The "no banner in California" fail is Osano's rubric, not law (CCPA is opt-out).

## OneTrust facts

- Meeting so far was only a meeting-booker; no substantive call yet.
- Enterprise leader; per Osano's own comparison doc, the one "designed for... centralized governance across many
  brands, domains" — i.e. the WanderOS shape. Trade-offs: months-long implementations, admin overhead, opaque
  sales-led pricing (well north of Osano once modules stack), sharp renewals. Demand multi-year price cap
  (precedent: Cookiebot doubled prices in a year).
- **Supports custom-UI write-back** (save-log-consent, consent receipts, collection points + JWT) — see above.
- Field-research caution (Jul 15, browser-probed from Norway): **Gymshark runs OneTrust and its Meta pixel + GTM
  fired on necessary-only consent** (OnetrustActiveGroups=C0001 while fbq fired). CMP presence ≠ enforcement —
  strongest evidence that enforcement must stay platform-owned no matter which vendor wins.

## What vendors actually sell us vs. what we build (settled analysis)

| Item | Verdict |
| --- | --- |
| Enforcement (script/SDK gating, server dispatch) | **Ours, always.** CMPs cannot see npm-bundled SDKs. |
| Jurisdiction rule matrix + translations, maintained | The real vendor product. Bus-factor insurance (in-house = someone owns every EU DPA's guidance forever). |
| Consent-record vault / receipts | Vendor paper reads better to regulators/enterprise-DD than self-attested git history, even if our records are better evidence. |
| Regulator/customer/diligence optics | Jeremy's point; real, decision-driving. |
| **Art. 27 EU + UK representative** | Mandatory, NOT a platform justification: standalone services from ~€59/mo (DataRep publishes pricing; VeraSafe custom; EU+UK = two reps). A US manager can't be it; an employee in Norway technically could but is anti-CYA (rep is the named enforcement target, Recital 80) and may imply an EEA "establishment" (Weltimmo) — counsel question. |
| DSAR intake | Buildable in a day (form → Slack + Airtable, deadline clocks). Osano's 5/mo tool adds little. |
| **DSAR fulfillment** | The real unbuilt work and it's ours regardless of vendor: delete/export a verified requester across Amplitude/Segment/Customer.io/Meta/Google + monolith User row. Pre-EU-launch item. No vendor does this. |
| Compliance scanning | Their monthly scan < a self-built Playwright consent-regression suite in CI. Weakest vendor pillar. |

## SE-call agenda (Wed Jul 22) — priority order

1. **Write-back or not**: does Osano have an API equivalent to OneTrust save-log-consent (our UI → their vault →
   receipt)? Docs beforehand if yes. (Emailed to Martin ahead of the call — see draft in session notes.)
2. **Guarantee in headless/custom mode** — validity + qualifying conditions **in writing**.
3. **WanderOS**: OEM/platform pricing for thousands of custom domains; per-host consent isolation (cross-domain
   sharing OFF); Compliance Check 3-domain cap vs our scale.
4. **MUV cap** 750K vs 250K + overage + multi-year price cap.
5. **Auto-blocking OFF** as a supported (not degraded) configuration.
6. **Consent Mode v2**: exactly one emitter of gtag consent signals (our engine today) — who owns it in their model?
7. **Migration/exit**: ingest existing ConsentRecords at cutover (no re-prompt); full export API.
8. **GDPR rep**: which entity (Osano International Compliance Services LTD / Osano UK Compliance LTD), EU + UK both?
9. **The Norway test**: is EEA (NO/IS/LI) in their default consent-required set or EU-27 only?
10. If their banner is the UI: live demo styled to the Kindred reference (bottom-corner card, equal-weight
    Accept/Decline, 5 languages, mobile bottom-sheet) before anyone signs.

## Related

- `tracking/docs/consent-architecture.md` (feat/consent-web-engine worktree) — the enforcement engine + train.
- `growth/docs/compliance-scan-qualification.md` — same probe method reused as a WanderOS lead-qual signal.
- Wander project memory: `project_gdpr_audit_2026_07.md` (Claude Code auto-memory) — running decision log.
