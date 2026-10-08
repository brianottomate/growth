# Connector UI workbench

The signed-in team workbench lives at `/lab/design-system/connectors`, linked
from Team tools, Lab, and the Assistant gallery. It inherits the Lab access gate
and no-index metadata.

One inventory (`src/server/mcp/connector-widgets.ts`) drives the MCP resources,
tool metadata, and gallery. The workbench renders the exact HTML served by MCP:

| View | Existing tool | Interactions |
| --- | --- | --- |
| Social previews | `renderSocialPosts` | Platform filters, carousel navigation, first comment |
| Next options | `presentNextOptions` | Answer/request choices, editable details, send status |
| Content calendar | `contentRead__upcoming` | Date groups, status filters, item discussion |
| Content pipeline | `contentRead__pipeline` | Work-item/standalone scopes, status bars, review handoff |
| Production queue | `contentRead__productionQueue` | Readiness filters, progress, next-step details |
| Work-item inspector | `contentRead__getWorkItem` | Brief, channel drafts, imagery, readiness, discussion |
| Campaign overview | `adsRead__openCampaign` | Creative/audience/delivery tabs, campaign review |
| Creative review | `adsRead__ideaContext`, `adsWrite__saveIdea`, `adsWrite__draftAd` | Sizes, slide navigation, copy variants, discussion |
| Catalog batch review | `adsRead__catalogState` | Approval filters, sketches, settings, export history |
| Brand picker + map | `brandRead__getMap`, `brandRead__list` | Search returned brands, coverage details, exploration |
| Listing photo picker | `mediaLibraryRead__listingPhotos` | Search, local multiselection, next-page handoff |
| Ad performance | `adsRead__top` | Local ranking, delivery metrics, creative details |

These views attach to existing read and local draft tools; no parallel capability catalog or
new provider mutations are introduced. Shared HTML/CSS and the bridge live in
`widget-shell.ts`. Payload strings become DOM text, never executable markup.
Composed creative and catalog cards are explicitly labeled as composition sketches;
they show source imagery and copy, not pixel-accurate exported template renders.
Supplied artwork is labeled separately. Listing selections remain local and only
send a review request; no import or provider action happens in the iframe.
Catalog writes retain plain receipts: call `catalogState` after a batch to review
the current state rather than flooding the conversation with one widget per edit.
The gallery validates fixtures, including alternate tool responses, against their
own canonical result schema. Shared renderer aliases advertise one resource.

Ad metrics explicitly refer to the returned shortlist. Spend/CPC retain the
source account currency because the result does not carry a currency code.

Samples contain synthetic workspace data, a public Growth image, and the public Wander logo. Every
sample is validated against its canonical MCP tool result schema on the server.
The same schema, serialized to JSON Schema, validates edited JSON before replay.
Controls cover phone, chat-panel, and wide frames; light/dark themes; held tool
results; and accepted/rejected follow-ups. Reset clears the preview session.

MCP Apps mode simulates initialization and `ui/notifications/tool-result`.
OpenAI globals mode provides `window.openai.toolOutput`, `openai:set_globals`,
and a mocked `sendFollowUpMessage` that resolves or rejects locally. The widgets
prefer the standard MCP message bridge after negotiation, with feature-detected
OpenAI follow-ups for the compatibility runtime. Host messages are logged.

The iframe has an opaque origin (`sandbox="allow-scripts allow-forms"`). Its
CSP blocks connections and form navigation while allowing local submit handlers
and the public Growth and Wander fixture image origins. JSON is posted as data and never
interpolated into HTML. Messages from other frames are ignored. Unsupported RPC
requests receive a method-not-found response. No tool, model, or provider action
executes inside the simulator.

This is a bridge simulator, not a replica of either host's chrome, permissions,
or production CSP. Verify final integration in the real host. Actual connector
resource CSP remains limited to configured media origins and the public
`assets.wander.com` / `assets-websites.wander.com` listing hosts; unavailable external
thumbnails display a fallback.

To add a view, register its tool, existing result schema, HTML, and URI in the
inventory and add synthetic samples. Extend the simulator only for bridge
methods the view needs. Keep customer data and credentials out of fixtures.

Validation: `bun run check`, `bun test`, `bun run ai:contracts`, plus browser
checks of filtering, ranking, success/rejection, detail submission, JSON replay,
and resizing. The existing MCP protocol test also reads every added resource
and verifies its tool metadata.

The OpenAI compatibility bridge follows the official reference:
https://developers.openai.com/plugins/reference
