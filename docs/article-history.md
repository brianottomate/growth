# Article review and recovery

Article generation now produces a candidate. The working draft stays in place
until an operator reviews that candidate and chooses **Use this candidate**.
The blog editor and typed creative document workspace share a History panel.
It includes generated candidates, accepted versions and recoverable snapshots
from earlier edits or CMS transfers. Older snapshots remain accessible through
pagination.

**Accept saved draft** records editorial sign-off on a manually written or edited
article. It checks the exact saved copy the operator reviewed. Any later edit
clears current acceptance and keeps the prior decision in history. A CMS push
retains acceptance because it changes the provider binding, while a pull replaces
copy and clears acceptance. The Download Markdown action exports the saved
article with title, description, slug and author metadata.

## Model and writer audit

`production_packet.document` remains the working draft. `article_revision` stores
immutable snapshots with a source and candidate disposition. `article_acceptance`
links a document to the snapshot representing its current editorial sign-off.
Ordinary saves use last-write-wins. Before overwriting an article, the document
service records the prior draft and clears its current sign-off.

The typed article writer finishes through `finishDocumentRun`. A successful
`write` run records one candidate and leaves the working document unchanged.
The run result remains the production receipt. Cancellation and expiry still
refuse late results. Dato pull/push retain their explicit transfer behavior and
snapshot the prior local document. Manual editor and assistant saves use
`saveCreativeDocument`. Image, video and email production keep their existing
apply behavior.

Accepting a candidate locks the document and candidate, preserves the current
working draft, applies the candidate and records acceptance in one transaction.
Repeating that acceptance returns its receipt without overwriting later edits.
Restoring a snapshot preserves the draft being replaced and the current CMS
item identity. A restore creates an editable draft for review.

All history and acceptance operations recheck the current owning organization
and active brand. Referenced assets must still belong to that brand when a
snapshot is applied. Source snapshots remain immutable; their candidate status
can move to accepted or dismissed.

## Shared operations

- `creativeRead.exportArticle` exports saved Markdown using the same formatter as the editor.
- `creativeRead.articleHistory` and `articleRevision` inspect history.
- `creativeWrite.acceptArticle` adopts a reviewed generated candidate.
- `creativeWrite.acceptCurrentArticle` records acceptance of the reviewed saved copy.
- `creativeWrite.restoreArticle` and `dismissArticle` manage local recovery/review.

The app and MCP use these same actions. Editorial acceptance does not publish,
push to a CMS, invoke a model or send a message.

## Migration and checks

Migration 0041 creates the revision store and preserves every existing article
as an initial snapshot. Migration 0042 adds the current acceptance relationship;
existing articles start without an inferred sign-off. The working documents are
unchanged by these migrations.

`scripts/database/verify-article-history.ts` runs on the named isolated Neon
experiment. It covers baseline preservation, generation without overwrite,
last-write-wins recovery, concurrent/retried acceptance, stale sign-off refusal,
CMS identity preservation, cancelled runs, cross-organization/media access and
history pagination. Model and CMS results are synthetic; no provider is called.
