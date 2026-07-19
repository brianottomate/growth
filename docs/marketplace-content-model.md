# Marketplace content model

Status: implemented first iteration, 20 July 2026

Wander Growth now has an evidence-aware workspace at `/app/apps` for Apple App Store, Chrome Web Store, ChatGPT plugin, and Claude connector marketing content.

This implements the `/app/apps` and `external_app` direction reserved in the product architecture map without adding database tables or version-history machinery.

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

The accepted Wander Staging TestFlight build proves that build 1.15.0 (309), its displayed name, and its icon were present on the operator’s iPhone on 20 July 2026. It does not prove the public App Store name, page, screenshots, description, keywords, support, or privacy fields.

## Exact versus directional surfaces

Apple and Chrome expose stable named listing fields and asset limits, so their maps are `exact`.

ChatGPT and Claude remain `directional` because their discovery programs and presentation are evolving. ChatGPT moved from an app-directory framing to plugin listings in July 2026; a plugin can include apps, skills, and app templates. Claude allows direct remote MCP configuration, while its public connectors directory has a separate review and policy gate.

Growth must re-check those platform surfaces before any submission instead of treating this field map as a permanent contract.

## Current Growth inventory

- Wander mobile: TestFlight evidence is recorded; the public product page and its marketing placements are not claimed live.
- Wander Growth for ChatGPT/Codex: the MCP/OAuth capability surface is repository-verified; the plugin identity, visual proof, public privacy, and support presentation are incomplete.
- Wander Growth for Claude: the MCP endpoint shape and tools are repository-verified; the production origin needs a live check and directory review remains unstarted.
- Chrome: the field map exists, but no Wander extension listing is invented.

## Ownership

Wander Growth owns Wander-specific marketplace inventory and execution context. It must not import another portfolio product's modules, data, or brand evidence. Cross-product editorial systems may reason across the portfolio, but store dashboards and runtime teams remain authoritative for publication, product behavior, and credentials.

## Deferred

- Version history and diffs
- Database persistence and migrations
- Localization
- Store API publishing
- Automated screenshot production
- Submission workflows

The next persistence iteration should attach listings to the existing brand and media models, reuse media provenance, and add review snapshots. It should not force persistent storefronts into the dated `platform_post` channel model.

## Official references

- [Apple app information](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-app-information/)
- [Apple screenshots and previews](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Chrome listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome listing quality](https://developer.chrome.com/docs/webstore/best-listing)
- [OpenAI plugins in ChatGPT and Codex](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex)
- [Anthropic connectors directory](https://support.anthropic.com/en/articles/11596036-anthropic-connectors-directory-faq)
- [Anthropic MCP directory policy](https://support.anthropic.com/en/articles/11697096-anthropic-mcp-directory-policy)
