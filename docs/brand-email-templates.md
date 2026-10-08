# Brand email templates

Wander is one brand. Its logos, colors, voice, tagline, concierge promises and
commercial offers belong only to Wander. Other brands share the layout and
property-card structure, with their own identity and copy guidance. A missing
setting falls back to neutral styling, never Wander branding.

On a brand’s Email page, **Brand email style** edits the background, primary
button and button text colors, plus an email copy guide. Blank colors use neutral
defaults. Save patches only `brand.email_sender.theme` and `copyGuide`, preserving
sender addresses, logos, contact information and value propositions. The existing
brand-manage permission check applies. These optional JSONB keys require no DDL.

Colors render inline for email-client compatibility. The 600px frame uses a
neutral background, white card, subtle border and 12px corners, following the
shared React Email layout conventions. Growth keeps its property cards, editing
markers, legal address and provider unsubscribe link. The shared email package
still renders the separate WanderOS product-update path.

Copy generation for template drafts, full drafts and individual block rewrites
uses the current brand’s email copy guide alongside its existing voice. New
full drafts also receive its brand story. Property blasts use under 100 words of prose outside home cards, short factual
home notes, and no em dashes or en dashes as sentence punctuation.
Existing draft copy is not automatically
rewritten when the guide changes. Unsupported discounts or service claims are
never inherited from the shared templates.

The image block’s **Composition template** picker offers Photo only, Email
header, Image hero, Split frame and Editorial overlay from the existing
composition renderer. Eyebrow, headline and supporting copy are edited in the
same block. **Image shape** chooses a 2:1 landscape banner, 3:2 landscape photo
or square crop; Photo only also offers the untouched original. Crop dimensions
are rendered into the saved image, so email clients do not depend on CSS cropping.
The source photo and selected format remain editable. Update composition renders a new image for preview; Save revision
persists it in the email. The source photo, template ID and copy stay in the
image’s editing metadata so reopening does not compound text onto an already
rendered image. Older cards without a template ID remain Email header.

Saved sequences live in the brand’s Email → Sequences workspace. Preparing a
sequence freezes its current email content for explicit review, while test runs
use named recipients and accelerated timing. Growth delivery and the native
WanderOS booking automations remain separate; a live bridge needs scoped event
wiring and duplicate-send suppression.

The [email recipe library](email-recipe-library.md) adds Brian’s 57 reference
recipes to the two property layouts. The AI discovers exact IDs, intended use and
required facts through `emailRead.listTemplates`. Draft generation accepts verified
context and selected catalog homes; transactional facts and offers never come
from the demo reference.
For chat and MCP, `emailWrite.draftFromTemplate` accepts an existing
`platformPostId` plus the full `brief`. It validates the slot’s organization and
brand, retains its calendar placement, and saves against its starting revision
to prevent overwriting intervening edits. Without a target it creates a new slot
as before. `generateDraft` remains copy-only. A full property-email request must
use the template path and verify the catalog, hero and CTA before claiming the
email is complete. If header composition rendering fails, retain the selected
source photo as the hero rather than dropping the image.
