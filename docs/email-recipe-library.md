# Email recipe library

Growth includes Brian’s 57 WanderOS email recipes alongside the existing Season
ahead and Home collection layouts. The reference library has 11 booking emails,
6 during-stay emails, 16 after-stay emails, 13 blasts and 11 holiday emails.
The recipes adapt the supplied rendered HTML; the original TSX/render scripts
were not available. These are editable Growth drafts with shared brand styling,
not byte-identical imports of the demo HTML.

Start from a template groups the recipes by category. It shows the intended use,
content structure and required facts. Reservation, payment, access, availability,
price, credit, review and offer claims require verified context. Recipes about a
specific viewed, saved, checkout, new or upgraded home also require an exact
catalog home selected from the current brand.

For AI and MCP, call `emailRead.listTemplates` to find an ID and its
`requiredContext`, then `emailWrite.draftFromTemplate` with `brandId`, `template`,
`brief`, and any required `verifiedContext`/`homeIds`. Pass `platformPostId` to
regenerate an existing slot. Generation keeps its calendar placement and sequence
membership. Its previous content remains in revision history. Approved or sent
content stays protected by the creative review workflow.

Example: a new-home announcement uses `brian-broadcasts-new-listing`,
`homeIds: [theBrandHomeId]`, and `verifiedContext.newHome` containing verified
announcement facts. A receipt uses `brian-booking-booking-receipt`, with
`booking`, `receipt` and `tripUrl` context. No reservation facts come from the
reference example. Keys ending in `Url` must use HTTPS; the CTA chooses a supplied
context link or the current brand’s booking site.

Reference prose and section order are included in the generation prompt as
untrusted design examples. Demo identities and amounts are redacted, and saved
outputs are checked for demo-brand contamination. Property cards always resolve
through the requested brand’s live catalog. The canonical document stores
`recipeId`, independently of its rendering format, so text-only recipes and
property digests both retain their provenance through editing and review.

Selecting a recipe does not connect events, enroll guests, activate a sequence,
create a discount code or send email. The trigger text describes intended use.
Marketing audience eligibility and transactional backend event wiring need their
own validation before delivery.
