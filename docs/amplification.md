# Amplifiers and amplification assignments

An amplifier is a workspace contact. A personal brand is an optional content
workspace. A publishing connection is a separate permission and integration.
None of these imply either of the others.

## Database shape

| Record | Responsibility |
| --- | --- |
| `amplifier` | Workspace, name, handles, contact notes, Slack identity, `handoffPreference` (`manual` or `slack`), optional `linkedBrandId`. |
| `amplification_target` | One request: source `platformPostId`, `amplifierId`, `destinationPlatform`, `actionKind`, coordination status, requested time, notes, suggested copy, optional `outputPlatformPostId`, and fulfillment evidence/Slack receipt. |
| `platform_post` | Optional real output draft under the amplifier's personal brand, with its own content, approval and publication state. It can exist without a channel or Zernio connection. |
| `platform_post_link` | Output → source relationship (`adaptation`, `quote`, `repost`, etc.). A manually supplied fulfillment post also gets this relationship. |

Assignments are unique by **source + person + destination + action**. Sahil can
have a LinkedIn repost and an X adaptation of the same Wander LinkedIn post,
each with its own status. `planned → asked → confirmed → fulfilled` describes
coordination; it does not substitute for output approval/publication status.

Contacts remain lightweight until a full personal content workspace is useful.
Linking an existing owned personal brand preserves all assignment history. Use
the normal brand creation workflow to create that workspace first. Unlinking or
changing a contact's brand is refused while assignments have output drafts.
The competitor/inspiration relationship table is unchanged: contact identity
and private coordination stay on the amplifier record.

## Copy and publishing

- A contact-only assignment stores suggested copy in `draftText`.
- Explicitly creating an output moves that copy to `platform_post.text` and
  clears `draftText`. Retried creation returns the same output without replacing
  operator edits. UI edits then update the real output, not a shadow copy.
- The output belongs to the amplifier's personal brand, never the source brand.
  Creating it leaves `channelId`, `scheduledAt` and delivery fields empty.
- Publishing checks that the assigned output still belongs to that personal
  brand and destination. Connected channels must belong to that brand as well.
- Adaptations use the normal draft/approval/publishing workflow. Native reposts,
  quotes, comments and Story shares remain manual handoffs: Growth's current
  social publisher does not implement those native actions. It rejects them
  rather than silently creating an ordinary brand post.
- Slack is an explicit external action, requires the contact's Slack handoff
  preference, and retains the existing approval/receipt behavior. Planning,
  linking a brand and creating a draft never send messages.

Ingest completes native assignments only when source, person, platform and
action match. It does not infer an X adaptation from an unrelated post. An
explicitly assigned output that is observed as published can complete its own
adaptation. Manual confirmation can record a published fulfillment post after
checking workspace visibility, destination and amplifier identity. Matching a
planned output to a live row preserves assignment and post-link references.

## App and agent interfaces

The initiative footer groups assignments by source post. Source content cards
show compact person/destination/status badges, and the content detail has the
same editor. Contact settings expose manual/Slack handoff and optional personal
brand linking. The initiative campaign summary keeps audiences and platform
plans compact and read-only beneath the ads.

The app, chat and MCP share canonical singular actions:

- `listAmplifiers`, `readAmplificationTargets`
- `saveAmplifier`, `requestAmplification`, `updateAmplification`
- `createAmplificationOutput`, `notifyAmplification`

`requestAmplification` is idempotent on the assignment identity; use the update
action for changes. Writes enforce the active workspace and personal-brand
ownership. Multi-person work is a sequence of individual calls.

## Verification

Normal gates are `bun run check`, `bun test`, and `bun run ai:contracts`.
`scripts/verify-amplification.ts` additionally exercises the real database with
disposable fixtures: cross-workspace denial, optional promotion, concurrent
retries, single editable copy, publisher identity, exact fulfillment and
migration replay. It requires `AMPLIFICATION_TEST_DATABASE_HOST` to exactly
match the disposable database host and makes no provider calls.

## Preview data

`scripts/prepare-vrma-amplification-preview.ts` is separate, opt-in preview data
preparation. It requires `AMPLIFICATION_TEST_DATABASE_HOST` to match the disposable
database host, removes only unshipped extra social channel drafts for the three
specified VRMA posts, and plans Sahil's two actions.
It saves removed rows to `/tmp/vrma-preview-channel-backup.json`. It is not part
of schema migration and sends/publishes nothing. Use an isolated Neon branch for
this preview data.
