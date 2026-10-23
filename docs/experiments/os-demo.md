# Ask WanderOS experiment

Internal route: `/lab/os-demo`. API: `POST /api/lab/os-demo`.
Both use the existing Lab access boundary: signed-in teammates in deployments;
local development is open. This is not a public landing page or live OS dashboard.

## Run

Use Bun. Set server-only `TYPESAFE_API_KEY` in the ignored `.env`. The optional
`ANTHROPIC_API_KEY` enables concise generated explanations; without it, or if the
writer fails, approved reference text is shown. No credentials belong in commits
or client environment variables. The personal development key is not configured
on Vercel by this change.

Run `bun dev --port 4410` and visit `/lab/os-demo`.
The lab index links to the experiment. Browse mode requires no provider calls.

## Behavior

JEV selects one of website, marketing, integrations, analytics, or unsupported.
The last question and selected topic provide bounded follow-up context. Code
constructs a fixed json-render spec using four approved components with no
model-controlled props, URLs, or actions. The API sends the selection immediately
as NDJSON, then the explanation. Provider failures expose a generic error with
retry available, never a fabricated selection. The writer cannot access business
systems; it receives only the question, bounded context, and product facts.

All previews are illustrative. Evergreen Stays is fictional; images are Wander
marketing assets; revenue figures are invented. These are purpose-built lab
components, not extracted production OS screens. Product statements are based on
https://www.wander.com/os and should be re-reviewed before a public experiment.
No website is published and no campaign is sent. Use sample questions without
personal guest details. Answers are not persisted. The details panel displays
selection timing, total timing, model confidence, and answer provenance locally;
it is not conversion analytics. Confidence is diagnostic, not proof of correctness.

## Verification, 2026-09-21

- `bun run check`: passes (existing repository style warnings).
- `bun run ai:contracts`: valid schemas and action policies.
- `bun test src/lib/os-demo/catalog.test.ts`: four boundary tests pass.
- Full `bun test`: 610 passed, two pre-existing failures in
  `src/lib/performance-ads.test.ts` (expected plan lengths 14/62, actual 15/63).
  Both the test and implementation match the base `origin/dev` files.
- Live question checks: website, post-stay marketing, analytics, PMS/Guesty,
  Guesty follow-up, pricing fallback, and unrelated recipe fallback passed.
  Observed JEV selection: 121–327 ms in this small smoke sample; completed generated
  answers approximately 1.3–2.2 seconds. These are local observations, not an SLA.
- Browser: real marketing request, browse-mode analytics, desktop and 390px mobile
  layouts checked. Empty input API request returned 400.

## Next before public rollout

Review product fidelity with OS owners and replace illustrative views with vetted
production component extracts where feasible. Expand evaluation with real sales
questions (sanitized), multi-topic questions, unsupported providers, and ambiguous
follow-ups. Add cohort assignment and conversion events in the public funnel;
then assess whether free-text interaction improves signup/qualified inbound over
browse-only controls. A public endpoint needs a separate bounded gateway and abuse
limits; do not remove the Lab gate. Public deployment also needs an appropriate
server API key. This change does not configure a deployment or touch wander.com.
