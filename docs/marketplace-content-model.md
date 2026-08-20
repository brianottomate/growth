# Marketplace content model

Status: implemented first iteration, 20 July 2026

Wander Growth has an evidence-aware field playbook at `/app/apps/playbook` for
Apple App Store, Chrome Web Store, ChatGPT plugin, and Claude connector content.
The database-backed operations workspace lives at `/app/apps`.

The playbook records marketplace requirements and evidence quality. Product
Atlas and storefront records hold the operational state, ownership, target
content, and freshness history.

## Shape

```text
Wander product listing
  -> marketplace surface
    -> visible field or asset placement
      -> current content
      -> truth state
      -> evidence
      -> next update
```

The surface playbook answers “what goes where.” The listing inventory answers “what do we currently believe is there, and why?” The strategic queue answers “what is the highest-value gap to close next?”

## Truth boundary

| State             | Meaning                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `verified_live`   | Seen on the public target surface with current evidence.                                           |
| `source_verified` | Confirmed in repository or operator evidence, but not proven public in that marketplace placement. |
| `draft`           | Proposed marketing content.                                                                        |
| `verify`          | A likely value or requirement that needs a current check.                                          |
| `missing`         | No useful content, asset, or evidence is available.                                                |
| `deferred`        | Intentionally outside the first pass.                                                              |

The public Apple page and the mobile repository confirm the current Wander app
identity. The page showed version 1.15.0, Travel, iPhone support, developer
Wander.com Inc, a 4.8 rating, and 1.2K ratings on 21 July 2026. The repository
identifies App Store Connect app 1582777762, bundle `com.wander.com.app`, and
source build 309. App Store Connect remains authoritative for unpublished
metadata and locale-specific fields.

## Exact versus directional surfaces

Apple and Chrome expose stable named listing fields and asset limits, so their maps are `exact`.

ChatGPT and Claude remain `directional` because their discovery programs and presentation are evolving. ChatGPT moved from an app-directory framing to plugin listings in July 2026; a plugin can include apps, skills, and app templates. Claude allows direct remote MCP configuration, while its public connectors directory has a separate review and policy gate.

Growth must re-check those platform surfaces before any submission instead of treating this field map as a permanent contract.

## Current Growth inventory

- Wander mobile: the public Apple listing and mobile source are verified. The
  screenshot set, support URL, keywords, and App Store Connect-only fields
  still need an operator check.
- Wander for ChatGPT/Codex: the Worker, two public read tools, and interactive
  search resource exist. Growth models `https://www.wander.com/mcp` as the
  distribution endpoint so the storefront and preview can move as one product.
  The route returned live inventory on 19 August 2026. The prospective
  storefront now carries the validated review copy, tool hints, output-schema
  coverage, five positive tests, and three negative tests. Deployment of the
  revised MCP metadata and OpenAI review remain pending.
- Wander for Claude: the current Worker responds to Claude and has returned
  live inventory. Growth uses the same modeled branded endpoint; public
  connector review remains a separate evidence gate.
- Chrome: the field map exists, but no Wander extension listing is invented.

## Ownership

Wander Growth owns Wander-specific marketplace inventory and execution context. It must not import another portfolio product's modules, data, or brand evidence. Cross-product editorial systems may reason across the portfolio, but store dashboards and runtime teams remain authoritative for publication, product behavior, and credentials.

## Deferred

- Localization
- Store API publishing
- Automated screenshot production
- Submission workflows

Storefront persistence uses the existing brand and Media Library models. It
does not force marketplace listings into the dated `platform_post` channel
model.

## Official references

- [Apple app information](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-app-information/)
- [Apple screenshots and previews](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Chrome listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome listing quality](https://developer.chrome.com/docs/webstore/best-listing)
- [OpenAI plugins in ChatGPT and Codex](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex)
- [Anthropic connectors directory](https://support.anthropic.com/en/articles/11596036-anthropic-connectors-directory-faq)
- [Anthropic MCP directory policy](https://support.anthropic.com/en/articles/11697096-anthropic-mcp-directory-policy)
