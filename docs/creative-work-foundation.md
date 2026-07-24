# Creative work foundation

Wander Growth's durable product is the reviewed creative direction, not a dependency
on any one generation provider.

## Product contract

One conversation can move from context and planning into a production-ready
brief. The resulting **production packet** is a first-class deliverable that can
be copied into Claude Design, ChatGPT, a video editor, an agency workflow, or an
in-product execution adapter. External production is not a fallback.

The optional Fal path consumes the same packet. It must not introduce a second
prompt model or become the owner of the creative brief.

```text
persistent assistant session
        ↓
reviewed provider-neutral production packet
        ├── copy/export → Claude, ChatGPT, video editor, agency
        └── optional adapter run → Fal candidate
                                      ↓ explicit acceptance
                           Wander Growth brand media library
```

## Durable boundaries

- `assistant_thread` and `assistant_message` preserve the complete AI SDK
  conversation, including tool calls and approvals. The server copy is
  authoritative; navigation or disconnecting does not discard the turn.
- `production_packet` is a provider-neutral handoff with purpose, prompt,
  constraints, format, references, and operator notes. It can belong to a
  content item and retains its originating thread.
- `creative_run` contains adapter-specific execution state. Fal and direct
  Google Gemini generation are the first providers, but the table is
  intentionally not provider-specific.
- A generated candidate is temporary. Only explicit acceptance copies it into
  Cloudflare R2 and creates a normal `media_asset` with generation provenance.
  When linked to a content item it is also attached to that item's media pool.

Removing the Fal client, route, and UI action later leaves sessions, packets,
accepted assets, and their provenance intact.

## Local and hosted completion

Local development submits to the Fal queue and polls status through Wander Growth.
Localhost is never passed as a webhook target. Preview and production use the
configured HTTPS `NEXT_PUBLIC_BASE_URL` and receive completion through an
unguessable, run-scoped webhook URL; the handler is idempotent. The UI polling
path remains available as recovery.

Fal credentials remain server-only. Submission opts out of provider input/output
retention where supported and requests one-day temporary object lifetime. The
candidate URL is accepted only from Fal-controlled HTTPS hosts or Fal's exact
Google Storage bucket path, then copied immediately into Wander Growth's own R2
storage when the operator chooses it.

The operator can currently choose between the existing Flux profile through Fal
and Google Nano Banana 2 directly through the Gemini API. Fal's hosted model
schema does not accept a caller-supplied Google credential, so the direct Google
adapter is what preserves Wander's Google authentication and billing. The
selected provider and model are recorded on `creative_run`. The reviewed packet,
negative prompt, handoff notes, and grounding rules are compiled into the actual
generation prompt so critical constraints are not silently dropped by models
without a separate negative-prompt field.

## Deliberate limits of the first slice

- The selected provider generates a single image candidate from the packet.
  Video, carousel assembly, and multi-candidate exploration can be added without
  changing the packet contract.
- Production packets are copyable Markdown rather than proprietary export
  files. This keeps the external workflow universal while real usage reveals
  which structured exports are worth adding.
- The session rail supports durable switching and creating sessions. Richer
  organization, sharing, and packet-library views can build on the same records.
