# Client report authoring

The Reports tab under each Performance client owns draft editing, review,
publication, and link revocation. Shared Growth actions serve the app, assistant,
and MCP. Publishing requires user approval in the assistant policy.

`performance_report` holds the editable draft. Saves use last-write-wins and
validate that the optional billing cycle belongs to the same account. The
workspace requires an active account and brand in the caller's organization.

`performance_report_share` holds the public snapshot. Review returns a fingerprint
of the current public content, including the client name. Publication checks it
under the account/report lock, then creates a random bearer link valid for 1–90
days. Later edits keep every prior publication intact. Revocation disables one
link. Public reads also check the original organization and archived account or
brand state. Link creation sends no message.

Migration `0039_report_publications.sql` copies every existing report and token
into a share, preserving its current content and draft/published label. These
existing links retain their previous lack of expiry. The old draft token column
stays for application rollback compatibility; new drafts never expose it through
a public reader. A later cleanup may remove that column after the rollback window.

Images must use the configured public Growth media host. The public media route
checks both the share and its allowed image URLs, disables caching, and refuses
redirects. Report pages carry no-referrer/noindex headers. PostHog drops events
containing report paths so bearer tokens cannot enter page or referrer analytics.

The operator CLI now requires `organizationId` with `brandSlug`. Draft saves return
an ID; a reviewed file with `status: "published"` creates a frozen link. It compares
the saved content before publication so a concurrent edit requires review again.

## Verification

Rehearse the migration on a fresh production-derived Neon experiment. Run
`scripts/database/verify-report-publications.ts` with the dedicated experiment name
and expected database hostname. It verifies existing-link preservation, ownership,
cycle scope, draft privacy, publication review, immutable snapshots, last-write-wins,
expiry, revocation, archival, organization moves, and CLI behavior. Its temporary
brands/accounts are removed at the end; provider APIs are never called.

Run `bun run check`, `bun test`, `bun run ai:contracts`, and `bun run db:check`.
The task-test fixture now applies migration 0038 so its schema matches the current
brand-task service. Publishing follows the normal PR-to-dev and GitHub Release
process. Vercel production applies the reviewed migration after compilation.
