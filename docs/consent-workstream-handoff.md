# Consent workstream — handoff

_Last updated: 2026-07-27. Owner: Kristian (kristian@wander.com). Companion docs: [cmp-vendor-evaluation.md](./cmp-vendor-evaluation.md), [osano-trial-handoff.md](./osano-trial-handoff.md) (live trial + banner styling), [compliance-scan-qualification.md](./compliance-scan-qualification.md). Interactive architecture walkthrough: [consent-journey.html](./consent-journey.html) (open in any browser — toggle visitor/site/consent state)._

This doc is the single entry point for anyone picking up the GDPR/consent work: what shipped, what's verified, what's one command from done, and what's deliberately deferred.

## 1. The consent train (core engineering) — MERGEABLE, awaiting the yeet

Homegrown consent engine: geo-regime resolution (32-country opt-in set in `tracking-core` `OPT_IN_COUNTRIES`; country primary, timezone fallback, fail-strict), denial-by-default provider gating (blocked vendors are **never fetched**), own banner, versioned `ConsentRecord`s.

All seven PRs are conflict-free. **Merge order matters** (publish dependency):

1. [tracking#55](https://github.com/wandercom/tracking/pull/55) (core) → publish
2. [tracking#56](https://github.com/wandercom/tracking/pull/56) (web — carries the Google Consent Mode fix, commit `8c64336`) → publish
3. Repin [wander.com#3206](https://github.com/wandercom/wander.com/pull/3206), [app#1425](https://github.com/wandercom/app.wander.com/pull/1425), [sites#826](https://github.com/wandercom/wander-sites-website/pull/826) off `file:`/vendored pins to published versions
4. [wander#20620](https://github.com/wandercom/wander/pull/20620) (monolith `User.analyticsConsent` — independent, any time)
5. Merge the three consumers
6. Before #3206 merges: strip the dev-only harness from the wander.com worktree (uncommitted; keep-vs-strip list is verified — only the Consent Mode fix is a keeper, and it's already in the package)

**Verified live** (July harness, browser-level ground truth): EU pre-consent = 0 tracker requests; accept = full load incl. real gtag/fbevents; reject = 0; analytics-only = ad vendors stay dark; DE/GB/tz-EU→opt-in, US/BR→opt-out. Google Consent Mode v2 `default: denied → update: granted` bug found, fixed in-package, regression-tested.

## 2. Sites geo-middleware PR — committed locally, needs push

Branch `feat/consent-geo-middleware` @ `ebb01763` in wander-sites-website (stacked on `feat/consent-regime-engine`). Middleware stamps `wos_regime` from `request.cf.country` (header-only → shared-HTML-cache-safe), re-affirms `wos_consent` server-side (Safari ITP), bootstrap resolves regime synchronously cookie-first; `/api/geo` demoted to fallback. **Not typechecked/tested locally** (sandbox limits) — let CI judge.

```bash
cd ~/Developer/wander/wander-sites-website
git push -u origin feat/consent-geo-middleware
gh pr create --base feat/consent-regime-engine --head feat/consent-geo-middleware --draft \
  --title "feat(consent): middleware-stamped wos_regime cookie for synchronous regime resolution" \
  --body-file ~/Developer/wander/pr-body-consent-geo-middleware.md
```

## 3. Vendor evaluation — two live Osano options (exploring both, not decided)

Two Osano products are being evaluated in parallel, both costed so finance can weigh the tradeoff. **The through-line: Wander owns enforcement either way** — our trackers are bundled ES modules gated in our own code, so the vendor buys us records, banner UI, rule-currency and a defensible "we use a recognized CMP" story, not enforcement. Live trial detail in [osano-trial-handoff.md](./osano-trial-handoff.md).

- **Option A — Unified Consent: probably the better fit.** A consent record / preference hub (system-of-record + audit console + cross-channel + REST Core API), **not** a script blocker. We render our own banner (already built), `POST` consent to UC, our engine enforces; Osano is the downstream certified record. Pros: fills the one gap we won't build cheaply, no useless blocker, we keep our banner. Cons: more build, likely higher cost, and the vendor's read is that a bring-your-own banner **would not** carry the no-fines guarantee.
- **Option B — standard Cookie Consent: the fallback, and maybe where we land.** Their rendered banner + geo/jurisdiction engine + auto-updated legal templates, guarantee attaching cleanly. Run **Permissive** — its script blocker is a no-op against our bundled trackers, so we still enforce everything. Pros: cheaper, simpler, the recognizable product finance knows. Cons: banner only themeable, blocker adds nothing.
- **No-fines guarantee = diligence signal, not a shield.** We are not banking on the $500k payout (terms void easily, and we do not plan to get fined). The value is pointing to a recognized CMP as good-faith effort. Not a decision driver.
- **OneTrust: out.** Script-tag blocker (irrelevant to bundled architecture), mandatory vendor banner, records product floors at $50k/yr × 3yr × 1M data subjects (we're ~650k), scanner is a slow Chrome-VM crawler with no SPA support.
- **Next:** trial banner live on real surfaces (done, see trial doc); confirm `STORAGE` semantics + whether a consent-change webhook exists; settle the ~800-domain topology; get the A-vs-B cost delta.
- Full detail in [cmp-vendor-evaluation.md](./cmp-vendor-evaluation.md).

## 4. GDPR-scan agent (this repo) — deployed-ready spike

`agents/gdpr-scan/` (branch `feat/gdpr-scan-agent` @ `5803068`, also present untracked in the working tree): an [eve](https://eve.dev) agent that audits sites for consent violations. Static pre-consent scan (tracker hosts, inline gtag/fbq/GTM fingerprints, Set-Cookie, consent markers), per-site catalog diff, consent-infra probe, `full_scan` skill, weekday-06:00 schedule, prod-safe route auth. Typechecks against eve 0.27.1; detection fixture-verified; **first live session not yet run**.

```bash
# staging:
~/Developer/wander/growth/agents/gdpr-scan/deploy.sh
# production:
YEET=prod ~/Developer/wander/growth/agents/gdpr-scan/deploy.sh
# needs Node 24 + authenticated vercel CLI; ANTHROPIC_API_KEY auto-pulled from growth/.env
# optional: PUSH_TO_DOPPLER=1 (override DOPPLER_PROJECT/DOPPLER_CONFIG)
```

Known limits (deliberate): static analysis only (a 🔴 = tracker in raw HTML is high-precision; "clean" ≠ compliant), hardcoded catalogs, wander.com-only schedule.

## 5. Scanner ecosystem — the three-piece opportunity

Three assets each lack what another provides:

| Piece | Has | Lacks |
|---|---|---|
| [jmcentire/webprobe](https://github.com/jmcentire/webprobe) (MIT, Python/Playwright) | Real-browser capture: every subresource + cookie per page, two-pass anonymous/authenticated crawl, stable run.json, cross-run diff, Astro/Next route detection | Consent semantics |
| `agents/gdpr-scan` (eve) | Consent brain: regime rules, tracker taxonomy, catalog diff, severity rubric, schedules, reports | A browser (static only) |
| audit.wander.com | Working grader funnel: URL form → async grader → scored results → lead-capture unlock → Slack | A privacy scanner |

Key insight: webprobe's authenticated pass repurposes as a **post-consent pass** (inject a synthetic consent record as the auth cookie); diffing passes = the behavioral test OneTrust structurally can't do. Next wire: a `run_webprobe` tool in the agent. Then: a Privacy & Consent score section in audit.wander.com fed by the agent (report headline: "Your CMP passed. Your site didn't."). Sequence: own estate → merchant estate → public funnel.

## 6. Deferred / phase-2 backlog

- **Login reconciliation ("stricter-wins")**: merge device consent record vs `User.analyticsConsent` on login; account-jurisdiction vs IP-jurisdiction, stricter applies. Storage exists (#20620); logic doesn't. Per-store consent is the legally correct model (each PM storefront ≈ its own controller) — do NOT build consent-once-applies-everywhere.
- **Merchant GTM policy**: `Trackers.astro` boots merchant GTM containers whose contents are invisible to our gate. Preferred: no-GTM policy + curated integration catalog + AI-triage for custom scripts (SRI-pinned, category-declared, CSP-bounded). CMP auto-blocking only earns its keep if GTM stays permitted.
- **Jurisdiction candidates**: BR (LGPD), CA (Québec Law 25 — needs region-level signal, country flip would catch all of Canada). One-line change in `OPT_IN_COUNTRIES` + vendored contract + conformance vectors.
- **Merchant opt-in-everywhere toggle**: per-merchant "consent-required globally" config option (EU-heavy merchants will want it; don't make it the default — US signal loss).
- **Osano integration (option-dependent, §3)**: if Option A (UC) → a UC Core API client that `POST`s consent records (`POST /v2/consents`, `/v2/consents/gpc`) and optionally `GET`s for server reads. If Option B (standard CMP) → the client adapter, already built in [tracking#69](https://github.com/wandercom/tracking/pull/69). Either way gated on trial creds + confirmed `OPT-OUT`/`STORAGE` semantics; our own engine (and, under A, our own banner) stay.

## 6b. Remaining launch-blockers — ownership (debrief view)

| Item | Where | Status | Owner | Blocks launch? |
|---|---|---|---|---|
| Server-side enforcement (pkg) | tracking-server | draft PR [tracking#66](https://github.com/wandercom/tracking/pull/66): `isProviderAllowed`, `meta.consent ?? loadConsent(userId) ?? parseConsentCookie` chain, `bypassConsent` | Kristian | Yes |
| Server-side caller wiring | monolith | ⚠️ ARCHITECTURE CHOICE (discovery done 2026-07-23): monolith does NOT use tracking-server — it has its OWN `packages/clients/segment` client with ~16 call sites (bookings, reschedulings, invites, referrals, wos-lifecycle, get-me). So this is not a mechanical wire: decide (a) adopt `@wandercom/tracking-server@1.1.0` across the 16 callers, or (b) build the same gate into the existing Segment client. `loadConsent` source = `get-consent` action (#20620); request-scoped callers need Fastify cookie parse. Batch/warehouse = growth repo, separate. | **Camille** (debrief decision) | Yes |
| Pre-consent-leak CI test | wander.com e2e (+ per-PR CI) | in progress | Kristian → Platform | Yes (the one control worth keeping; scanning half is the `gdpr-scan` agent, §4) |
| WanderOS sanitizer + CSP | wander-sites-website | NOT started; being reframed as a "limit merchant GTM containers" handoff-talk topic | CPA / Camille + a handoff-talk decision | Yes for PM-site coverage |
| /cookies → DB mirror | wander.com/app client | endpoint exists (#20620); client mirror-on-login NOT wired | Kristian | Needed for logged-in server enforcement |
| Osano adapter (consume vendor signal) | tracking-web/core | BUILT — [tracking#69](https://github.com/wandercom/tracking/pull/69): `mapOsanoConsent` + `subscribeToOsanoConsent`. Additive/inert until a consumer calls it. Consumers must still suppress their own banner when Osano is the source | Kristian | No (unblocks Option B) |
| DSAR deletion propagation | monolith + tracking-server | NOT started (`bypassConsent` hook exists) | Compliance + Camille | Before EU launch |
| Login reconciliation (stricter-wins) | monolith + tracking-web | designed not built (§6) | Kristian + Camille | No (phase-2) |

## 7. Gotchas for whoever picks this up

- The wander.com consent worktree carries an **uncommitted dev-only harness** (consentHarness.ts, `api/__probe/`, vendor-tracking/, pnpm pins, un-gate edits in analytics.ts). Strip before #3206 merges. The Google fix is already in the package — don't re-add it app-side.
- Worktrees live under `~/Developer/wander/.stacks/consent/`. Never `git worktree prune` from a sandboxed/Cowork session — host-pathed worktrees look prunable and get destroyed.
- `agents/gdpr-scan` files exist both in the branch commit and untracked on `main` — before checking out or merging the branch locally: `git add agents/ && git stash` (or delete the untracked copy).
- Cowork sandbox sessions cannot push to GitHub or reach Vercel/Doppler APIs — commits land locally; pushes are always a human step.
