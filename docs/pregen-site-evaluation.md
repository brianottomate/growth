# Pregen site evaluation: two-sided ranking, growth-native

Status: **design, not built.** The generation engine is not ready, so nothing
here runs yet. Written so the build can start without re-deriving the decisions.

Last verified July 29, 2026.

## What this has to answer

Which prospects should we spend a site build and an operator review slot on?

Not "whose site is worst". A prospect whose current site is genuinely good is a
bad target even if we could build them something decent, and a prospect with an
awful site is still a bad target if our generated preview came out weak. The
ranking signal is the **gap**, so both sides have to be scored.

## Decision: build the scorer in Growth

The scorer lives in `growth/`. Not in the monolith, and not called out to the
monolith over HTTP either — Growth owns this end to end.

That is a standing architectural preference (Kristian: *"I hate the monolith. I
want as little to do with it as possible"*), and it costs us nothing here,
because the constraint that actually matters is satisfied either way:

> **One yardstick.** The output is `ourScore − theirScore`. Two *different*
> scorers produce two different scales, and subtracting across them yields a
> number that looks quantitative and is noise. So the prospect's current site
> and our generated preview must be scored by the **same** scorer.

"Same scorer" does not mean "the monolith's scorer". A Growth-native scorer
applied to both sides satisfies it completely. Growth already has the pieces:

- **Firecrawl** (`src/server/clients/`) to fetch and render the page.
- **Claude** for the judged dimensions, via `generateText` + `Output.object`
  (house rule: never `generateObject`/`streamObject`).
- **R2 media pipeline** for screenshots, which the Send Review card wants anyway
  (*"a screenshot in the card would be super cool — I'd love that actually"*).

### What the monolith has, and why we are not using it

For the record, so this is not re-litigated: the monolith exposes a live,
URL-driven grader at `POST /guest-api/growth/site-grader` (unauthenticated,
async, ~5 min per site), scoring conversion/mobile/seo/content/data. It works.
It was the earlier recommendation here purely to save build effort.

Reasons not to, beyond the standing preference:

- `summary.overall` is **not directly subtractable** between two runs. `content`
  scores photo count on property pages only and returns `null` when unknown;
  `mobile` can drop out the same way, and the overall is renormalized over
  whatever survives. Two runs can be computed over different denominators, so a
  gap-based ranking would need a shared-category recomputation on top.
- `metrics.cwv` is **always null** — the Core Web Vitals branch is commented-out
  dead code and `mobile` is a heuristic over script bytes, lazy images and
  preloads.
- **No design or visual dimension at all**, which is usually the most persuasive
  axis for a "we would rebuild this" pitch.
- Built for one-human-at-a-time lead-gen traffic, no rate-limit contract, and
  ~5 minutes per URL. Batch use across ~900 companies would need to be agreed
  with the platform team.

A Growth-native scorer avoids all four by construction: we choose stable
dimensions, so nothing renormalizes away and the two sides stay comparable.

## Dimensions

Emit **every dimension, always** — a null-able dimension is what created the
comparability trap above. Score 0–100 each, fixed weights, and record the raw
per-dimension numbers so weights can change without re-crawling.

| Dimension          | Source                    | What it looks at                                                        |
| ------------------ | ------------------------- | ----------------------------------------------------------------------- |
| `bookingPath`      | HTML                      | Is there a direct booking/enquiry path, and how many steps to reach it   |
| `priceTransparency`| HTML                      | Are rates and fees visible before a contact form                        |
| `inventory`        | HTML                      | Are individual properties presented as real pages with photos           |
| `technicalHygiene` | HTML + headers            | Title/meta/H1, structured data, sitemap, `noindex`, mobile viewport     |
| `mediaQuality`     | Screenshot + HTML         | Image resolution, hero treatment, obvious stock/placeholder imagery     |
| `visualDesign`     | Screenshot (Claude vision)| Composition, typography, whether it reads as a professional 2026 site   |

`visualDesign` and `mediaQuality` are the judged ones and the reason Growth owns
this: they are what a property manager actually reacts to, and no existing
Wander tool scores them.

Keep the **judged** and **mechanical** scores separately visible rather than
collapsing everything into one number — blending hides which side of the
argument is strong.

## Ranking

```
gap = overall(ourPreview) − overall(theirSite)
```

Rank descending on `gap`, subject to two gates that no score can override:

1. **Absolute floor on our preview.** Below it, exclude regardless of gap. A weak
   preview sent to someone with a terrible site is still a weak preview with our
   name on it. This gate is what makes "build and rank all ~800, then follow our
   own internal ranking" safe.
2. **Enrollability.** Already live — `/leads` and the `enrollableOnly` filter
   require a live contact with an email, a `hubspot_contact_id`, and no mirrored
   opt-out. Ranking a company we cannot email wastes the slot.

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
  overall         int   -- weighted across the fixed dimensions
  dimensions      jsonb -- every dimension, always populated, auditable
  judged_notes    jsonb -- the vision pass's reasoning, for spot-checking
  screenshot_id   → media_asset(id)
  engine_version  text  -- prompt + weight version, so cohorts stay comparable
  evaluated_at, created_at
  unique (domain_id, kind, engine_version)
```

Cost: dominated by the vision pass. One high-res screenshot is roughly 1.5–4.8k
input tokens, so at Sonnet 5 rates a scored side is well under a cent — trivial
next to the $2–5 the site build itself costs.

## Build order

Steps 1–3 stand on their own and need no generated site, which is the point:
they let us rank *who to build for* before anything is built.

1. Screenshot capture + R2 storage, wired into the Send Review card.
2. Mechanical dimensions + `leads.site_evaluation`, scoring the **prospect** side
   only. This alone produces a ranked target list.
3. The judged dimensions (`visualDesign`, `mediaQuality`) on prospect
   screenshots.
4. Run all of the above against generated previews once they exist. Only here
   does `gap` become computable.
