# Pregen site evaluation: two-sided ranking

Status: **design, not built.** The generation engine is not ready, so nothing
here runs yet. Written so the build can start without re-deriving the decisions.

Last verified July 29, 2026.

## What this has to answer

Which prospects should we spend a site build and an operator review slot on?

Not "whose site is worst". A prospect whose current site is genuinely good is a
bad target even if we could build them something decent, and a prospect with an
awful site is still a bad target if our generated preview came out weak. The
ranking signal is the **gap**, so both sides have to be scored.

## Decision: reuse the site grader for both sides

There is already a live, URL-driven site scorer. Use it — for the prospect's
current site *and* for our generated preview.

```
POST https://api.gke.wander.com/guest-api/growth/site-grader
  { url, brandName?, hqCity?, portfolioMarkets?[], maxDepth?=2 }
  → { id, normalized_url }

GET  /guest-api/growth/site-grader/{id}?url=<normalized_url>
  → { status: "running" }
  | { domain, summary{ overall, grade, weights, categories }, metrics, issues[], stats }
```

Unauthenticated (headers are just `X-Wander-Client: wander-web`), async, poll
every ~5s with a realistic 5-minute ceiling per site. Typed definitions already
exist in `audit.wander.com/src/services/fetcher/guest-api.d.ts` — copy those
rather than re-deriving them, and do **not** type against
`audit.wander.com/src/data/mock.json`, which has a sixth `pms` category that
does not exist in the real schema.

Scoring engine, for reference when a number looks wrong:
`wander/src/growth/growth/module/src/logic/site-grader/` — `summary.ts` holds
the weighted mean and the A–F mapping. Weights are `conversion 35, mobile 20,
seo 20, content 15, data 10`.

### Why reuse rather than build our own

**One yardstick, or the gap means nothing.** The whole output is
`ourScore − theirScore`. Two different scorers produce two different scales, and
subtracting across them yields a number that looks quantitative and is noise.
Building a separate growth-side scorer for our own preview would actively
destroy the thing we are trying to measure.

This is also the option Kristian named — "our own existing site auditor" — and
it sidesteps the real objection, which was to the monolith's *build-time
revision-ratchet* eval gate in PR 3A, not to the audit service. Growth calls
this over HTTP as a service; it does not take a dependency on monolith code in
the generation pipeline. Those are different couplings and only the second one
was the complaint.

### The comparability trap

`summary.overall` from two runs is **not** directly subtractable.

`content` scores photo count on property-detail pages only and returns `null`
when photo count is unknown; `calculateOverallScore` then drops it and
renormalizes over the remaining weights. `mobile` can drop out the same way. So
a prospect site scored over four categories and our preview scored over five
produce overalls computed on different denominators.

**Recompute the overall over the intersection of categories present in both
results** before diffing, using the same weights renormalized to that shared
set. Store the raw per-category numbers from both runs so this stays auditable
and so the shared-set logic can change without re-crawling.

### Known gaps to design around, not to trust

- `metrics.cwv` is **always null** — the Lighthouse/Core-Web-Vitals branch is
  commented-out dead code and `mobile` is a heuristic over script bytes, lazy
  images, srcset and preloads. Never let a CWV claim reach copy.
- **No design or visual-quality dimension anywhere**, which is usually the most
  persuasive axis for "we would rebuild this". See below.
- **No screenshot is persisted.** `audit.wander.com` hotlinks
  `wandershot.vercel.app/shot?url=…` and stores nothing (and builds a malformed
  double-`?` URL while doing it).
- Built for one-human-at-a-time lead-gen traffic. No rate limit was found on the
  `/guest-api` prefix, which is not the same as there being none. **Agree bulk
  use with the platform team before running a batch**, and keep concurrency low.

## The growth-owned half: visual quality

The grader has no opinion on how a site *looks*. Growth should own that, for two
reasons: it is the most persuasive axis for this pitch, and growth needs a
screenshot anyway for the Send Review card ("a screenshot in the card would be
super cool — I'd love that actually").

One capture serves both. Capture the prospect homepage and the generated preview,
store both in R2 through the existing media pipeline
(`docs`/`reference_growth_media_pipeline`: upload-time WebP tiles, served via
`next/image`), then run a single Claude vision pass over the pair scoring
composition, typography, imagery quality, and whether it reads as a professional
direct-booking site.

Keep the visual score **separate** from the grader score rather than blending
them into one number. Blending hides which side of the argument is actually
strong, and the grader's weights were not designed with a visual term in them.

## Ranking

```
gap = sharedOverall(ourPreview) − sharedOverall(theirSite)
```

Rank descending on `gap`, subject to two gates that are not negotiable by score:

1. **Absolute floor on our preview.** Below it, exclude regardless of gap. A
   weak preview sent to someone with a terrible site is still a weak preview
   with our name on it. This is the gate that makes "rank all ~800 and follow
   our own internal ranking" safe.
2. **Enrollability.** Already implemented — `/leads` and the `enrollableOnly`
   filter require a live contact with an email, a `hubspot_contact_id`, and no
   mirrored opt-out. Ranking a company we cannot email wastes the slot.

## Internal only

These scores rank targets. They must never surface in outreach copy.

The sequence policy already forbids telling a prospect their current site
underperforms — that is a diagnosis we cannot support, and the policy gate blocks
it. A low `theirScore` is a reason to *contact* someone, never a claim to make to
them. Keep the score out of every HubSpot `growth_pregen_*` property so it cannot
leak into a token by accident.

## Proposed shape

A separate table rather than columns on `leads.domain`: evaluations are
re-runnable, versioned (prompt and weight changes), and there are two per
company.

```
leads.site_evaluation
  id, domain_id → leads.domain(id)
  kind            'current' | 'preview'
  url             what was actually scored
  grader_overall  int, as returned
  grader_shared   int, recomputed over the shared category set
  grader_grade    text
  categories      jsonb   -- per-category numbers, both sides, auditable
  visual_score    int     -- growth-owned vision pass
  visual_notes    jsonb
  screenshot_id   → media_asset(id)
  engine_version  text    -- so a re-scored cohort is comparable
  evaluated_at, created_at
  unique (domain_id, kind, engine_version)
```

## Build order when the generation engine is ready

1. Screenshot capture + R2 storage, wired into the Send Review card. Independently
   useful, needs no generated site, and is the visible half.
2. Grader client + `leads.site_evaluation`, scoring the **prospect** side only.
   Also independently useful: it ranks who to build for before anything is built.
3. Vision pass on prospect screenshots.
4. Preview side of both, once previews exist. Only at this point does `gap`
   become computable — steps 1–3 stand on their own until then.
