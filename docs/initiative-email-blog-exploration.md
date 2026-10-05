# Initiative email and blog exploration

## Existing records

Initiative membership currently supports a content post, series, or paid campaign.
Email issues are brand-owned `platform_post` records with platform `newsletter`.
Their editable subject, preheader, Markdown, and CTA live in `email_document`.
Delivery and audience snapshots live separately in `message_send`.
Blog articles are brand-owned `platform_post` records with external kind
`blog_article`; DatoCMS remains the article authoring and publishing system.
Either record can exist without a parent `content_post`.

## Membership and filtered views

Keep the existing initiative membership unchanged. Link a canonical
`content_post` to the initiative; its `platform_post` children provide social,
email, and blog versions. An email-only or blog-only piece gets one content post
with one platform version. A shared story can have several versions under the
same content post.

Existing standalone email or blog platform posts must be attached to a content
post when included in an initiative. Preserve their IDs, email documents, and
provider references rather than copying the records.

Build section-specific views by filtering the linked content posts' platform
versions. A content post with social, email, and blog versions appears in all
three relevant sections, with each card showing that version's copy, status,
and destination. Counts describe versions, not additional content records.
Unlinking the parent content post removes it from every initiative section;
editing or deleting one platform version is a separate action.

## Overview

The local overview now has one combined **Email & blog** section after
standalone social posts and before team amplification. It uses a two-column
container-query layout, collapsing to one column in narrow spaces.

- Email cards show subject, preheader, lifecycle status, known scheduling or
  publication date, series context, and a link to the newsletter editor.
- Blog cards show cover thumbnail, title, description, lifecycle status, known
  dates, series context, and a link to the existing article view.

The shared preview read model filters all included content posts' platform
versions, deduplicates them by ID, and excludes email/blog versions from social
card channel counts and media. No email or blog drafts are invented for VRMA;
it currently displays compact empty cards for both types.

Approval does not imply delivery. Unknown dates and audiences remain empty.
Audience summaries and rendered-email dialog previews remain future refinements.
The Link content button reuses the existing content-post membership dialog.

## VRMA first pass

Draft one pre-event email around booth #747 and Sahil's session, plus a short
article explaining the direct-booking direction. Reuse supplied artwork and
retain designer/claims review requirements. Audience, session date, CTA, and
article destination need review before authoring final copy or scheduling.

## Implementation boundaries

The implementation extends canonical service and AI contracts alongside the UI,
without changing initiative membership schema. Opening the overview creates no
draft records and invokes no send or publishing operations. The legacy VRMA
bootstrap inserts have been removed and covered by a migration regression test,
so deployments no longer restore deliberately removed series links.

## Scoped assistant workflows

Initiative Shape and section Create buttons open a fresh conversation carrying
initiative, section and optional selected campaign/content/version IDs. The chat
route verifies ownership and membership, persists that scope for follow-up turns,
and enables the initiative reader/linker alongside the relevant authoring tools.
Shape discusses first. Create develops one specific brief, then uses singular
creation and membership tools sequentially. A campaign creation dialog saves only
the campaign shell; a failed membership save retries the existing shell ID.

Campaign previews show compact audience names and platform draft/push state
beneath the ads, without nested action panels or disclosure controls. Create and
Shape stay at the section level. A local platform draft is explicitly
distinguished from a pushed provider campaign.

Blog authoring uses a shared article document with the owned contentPostId,
selected for its existing blog slot. This preserves initiative membership through
development and explicit Dato draft transfers. The blog specialist is read-only.
Unmaterialized blog briefs open the content work item instead of a CMS preview.
No generation, publication or paid delivery is performed by opening Shape.
