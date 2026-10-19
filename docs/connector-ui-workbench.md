# Connector UI workbench

The signed-in team workbench lives at `/lab/design-system/connectors`, linked
from Team tools, Lab, and the Assistant gallery. It inherits the Lab access gate
and no-index metadata.

One inventory (`src/server/mcp/connector-widgets.ts`) drives the MCP resources,
tool metadata, and gallery. The workbench renders the exact HTML served by MCP:

| View | Existing tool | Interactions |
| --- | --- | --- |
| Email | `emailRead__get` | Subject, preheader, body excerpt, CTA and separate planning/creative/delivery status |
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


Brand results use a dedicated identity card: a fixed-size contained logo with
initials underneath, relationship badge, one primary workspace action for a
single result, and compact rows for multiple results. Image failure removes only
the image, preserving geometry. WanderOS logo proxies pointing at public
Wander asset hosts resolve to that underlying source; the simulator permits the
same first-party asset origins without allowing arbitrary image hosts. Fixtures
include a single client, unavailable logo, long name, multiple brands and empty
results. Brand cards provide their own frame and do not request another host border.

Email is a dedicated connector view over the existing content post and canonical
email document. It is not projected from social copy. Samples cover tentative
newsletter dates, approved but unqueued content, scheduled broadcasts, sent emails
and empty slots. These read-only cards link to the full email workspace.

Email previews now use the canonical newsletter renderer, including hero images,
structured home sections, CTA, brand identity and footer. `emailRead.get` returns
rendered preview HTML alongside the canonical document. Internal chat reuses the
editor's phone/desktop/full-screen frame; the MCP App isolates HTML in a scriptless
`srcdoc` frame, declaring only the `about:` frame scheme and its existing public
asset/font origins. The simulator uses the same restrictions. Actual host review
is still needed after deployment. WanderOS image proxies resolve to their public
Wander source assets in the connector so browser previews fit the existing CSP.

Newsletter series have a separate **Preview newsletter** reading dialog with
edition navigation and the existing sample-guest controls. The list and calendar
remain the working views for planning and approval.

**Client email preview** appears in Newsletters, Broadcasts and Extra. Operators
choose up to 24 existing emails. PDF export is available directly from this
selection without publishing a public link. It opens a full-length print document
and the browser's Print / Save as PDF action; portrait images scale to fit paper
without cropping. Every selected edition is included, not just the interactive
iframe viewport. A synthetic two-edition review and print view are linked from
the workbench for QA.

The separate `/email-preview/[token]` client page has no login, recipient data,
approval mutation or send controls. Links expire after 7, 30 or 90 days and show
only the explicit selection's latest saved creative. They do not automatically
add new editions. PDFs capture content at export time; online links remain live.
This follows the existing ad preview's brand connect-token revocation model,
with its own purpose-specific signature and organization/brand/selection claims.
Rotating the brand connect token revokes these links too. Archived/deleted content
is unavailable. Public reads never create email documents or read delivery ledgers.
No public Winter Park link was created during QA.

`emailRead.previewOptions` and approval-gated `emailWrite.sharePreview` expose the
same options/sharing actions through the normal Growth catalog and MCP.
