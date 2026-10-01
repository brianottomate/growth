# Assistant speech

The shared assistant composer offers **Dictate** and **Talk with Growth** on its
workspace, creation, and Next surfaces. Typed requests and voice delegations use
the existing durable input queue and canonical Growth tools.

## Dictation

Dictate opens an authenticated transcription-only WebRTC connection to OpenAI
using `gpt-live-transcribe`. Words append to the starting composer draft. Done
commits the audio and waits for final transcription; the operator edits and sends
the draft. Cancel and Escape restore the starting draft. A connection failure
preserves partial words. Capture ends on page hiding, navigation, closure, or the
two-minute limit. There is no automatic send or provider fallback.

## Conversational voice

Talk opens `gpt-live-1` with client delegation. The server checks live organization
membership and private/shared thread access, loads bounded saved history, and
owns instructions and data-channel permissions. Browser configuration cannot
replace these settings. Audio travels directly between the browser and OpenAI;
Growth retains its provider key on the server.

The application orders caption fragments by provider speech timestamps. Each
client delegation takes new user speech through its timestamp boundary, waits
briefly for late captions, and submits a durable input with a stable ID. Duplicate
delegation events cannot submit it again. Acceptance is serialized while result
listeners run independently, so an operator can send a correction during work.
Captions arriving beyond the brief reconciliation window remain visible; a late
fragment within an already submitted request does not create another operation.

The existing assistant runs each accepted input. Its saved reply carries
`queueInputIds`, including corrections consumed by that turn. Voice reads results
by input ID with a fresh access check, then sends written prose as commentary.
Tool JSON and reasoning stay out of spoken results. Pending approval is announced
and must be handled through the existing chat card. Approval continuations retain
the server's request association. Spoken confirmation of an operation comes from
its saved result. Failed results direct the operator to the written details.

Live captions render as complete speaker-labelled paragraphs, with speech cues
removed. The scroll area follows new words unless the operator scrolls back.
After End, the full call stays available in the expandable Voice transcript until
another call starts or the work context changes. Closure stops capture immediately
and allows up to 15 seconds for final provider events before recovering unsent words.
These captions remain local to the current page; they are not saved thread history.
Delegated user requests and written
assistant replies persist in the normal thread. Social conversation and spoken
paraphrases are transient captions; they are not separate saved messages.

Pause releases microphone capture and mutes provider input. Resume reacquires the
microphone. End, Escape, panel closure, page hiding, navigation, unmount, and the
ten-minute limit release the connection. Ending voice leaves accepted work in the
durable queue. Unsaved speech becomes an editable draft on deliberate closure.
An uncertain acceptance blocks subsequent automatic delegation and requires
reviewing the queue before submitting that recovered draft. Side effects are
never automatically replayed on a new voice connection.

## Steering and queuing

New speech requests enter the queue by default. **Steer current work with next
request** applies the next spoken request as a correction. The server requires
matching work context and text-only input. Queued text also has a control to apply
it as a correction without retyping. Corrections are consumed at the next model
step. Finished actions retain their receipts. If the target turn finishes before
acceptance, the message becomes a queued follow-up and the UI says so.

Queue pause, stop, edit, cancel, and retry continue to use the durable server
state. A failed turn pauses later work for review. Voice ends on route changes so
its frozen page context cannot silently follow the operator to a different task.

## Admission and privacy

Both setup endpoints require an authenticated organization member. Setup attempts
share a rolling limit of 20 per user per hour. PostgreSQL serializes admission
across app instances with a user-scoped advisory lock. Existing assistant-run
records track `speech-session-setup`; their completion describes SDP setup only.
No new tables or schema deployment are required. Setup failures count toward the
limit. Client capture limits supplement provider session limits.

Growth stores no audio files. OpenAI handles streamed audio and its retention
policies apply separately. Voice session configuration includes `store: false`.
`OPENAI_API_KEY` must be configured in the target Vercel environment; absence
returns a clear unavailable response. Speech uses OpenAI directly while the
canonical text assistant retains its existing model and execution policy.

## Verification

`/lab/design-system/chat#voice` provides interactive state specimens behind the existing
lab gate. They make no provider calls. Run `bun run check`, `bun test`, and
`bun run ai:contracts`.

Before release, run an authenticated browser session with real speech and verify
inbound audio, delegation, written results after reload, a correction during a
running turn, approval continuation, mute/resume, and closure. Check physical
microphone behavior and mobile Safari separately. A rendered specimen or passing
unit test does not establish provider acceptance or audible playback.

Protocol references:

- [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation)
- [AI SDK realtime and WebRTC](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-realtime)
- [Live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
