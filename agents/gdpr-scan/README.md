# gdpr-scan-agent (spike)

An [eve](https://eve.dev) agent that audits wander.com and WanderOS merchant
sites for consent violations: trackers loading pre-consent, undeclared
merchant-injected scripts, and broken geo/consent plumbing. Grew out of the
July 2026 consent-verification harness — this is that harness turned into a
persistent, schedulable agent, and the engineering side of the
audit.wander.com compliance-scan wedge.

## Layout

```
agent/
├── agent.ts                  # model config (direct Anthropic; swap to gateway on deploy)
├── instructions.md           # identity + severity rubric (🔴🟠🟡🟢)
├── tools/
│   ├── scan_page.ts          # cookie-less fetch → tracker/script/cookie inventory
│   ├── diff_catalog.ts       # observed vs declared trackers per site
│   └── check_consent_infra.ts# /api/geo + regime-cookie stamping probe
├── skills/full_scan.md       # the audit playbook
├── schedules/daily-scan.md   # weekday 06:00 scan (cron frontmatter)
└── lib/                      # tracker signatures + site catalogs
```

## Run it

Needs **Node 24+** and `ANTHROPIC_API_KEY` (already in `growth/.env`):

```bash
cd agents/gdpr-scan
npm install            # or bun install
export ANTHROPIC_API_KEY=...   # or: doppler run / dotenv from growth/.env
npm run dev            # interactive TUI
```

Then try: `scan https://wander.com and give me the full report` — or invoke
the skill directly: `run a full_scan on wander.com`.

Headless (HTTP API on :2000):

```bash
npm run dev:headless
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Run the full_scan skill on https://wander.com"}'
```

## Spike boundaries (deliberate)

- **Static analysis only** — no JS execution, so a 🔴 (tracker in raw HTML)
  is high-precision, but "clean" only means clean-under-static-analysis.
  Follow-up: a `browse_page` tool on Playwright in the eve sandbox to diff
  pre/post-consent network requests (what the July harness did manually).
- **Catalogs are hardcoded** in `agent/lib/catalog.ts`. Production should
  read the WanderOS website registry (it already stores per-merchant
  `googleAnalyticsId` / `googleTagManagerId` / `metaPixelId`).
- **Site list is manual.** The daily schedule scans wander.com only; wire the
  merchant-domain feed before fanning out.
- **No channel** — reports land in the session. Add `agent/channels/slack.ts`
  to pipe NEW-FINDINGS reports into #legal or #growth.
