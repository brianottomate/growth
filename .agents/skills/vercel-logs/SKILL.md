---
name: vercel-logs
description: Fetch and analyze Vercel deployment logs for the wander/growth project. Use when the user asks about production logs, errors, sync results, workflow activity, or wants to debug a specific route or email address in the growth app.
allowed-tools: Bash
---

# Vercel Logs

Fetch production logs from the `wanderdev/growth` project using the Vercel CLI.

## Base Command

```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message'
```

Always include `--no-follow` to get historical logs instead of streaming. Use `--json` and pipe through `jq -r '.message'` to get all log lines including internal function logs.

**IMPORTANT: Do NOT use `--query` for content filtering.** The `--query` flag filters at the HTTP request level and only returns the top-level request summary line — it will miss all internal `console.log` lines from within the serverless function (BigQuery results, BDR assignment, sync outcomes, etc.). Always fetch without `--query` and filter locally with `grep` or `jq select`.

## Common Filters

### Time range (always set one of these)
```bash
--since 1h        # last hour
--since 24h       # last 24 hours (default for most debugging)
--since 7d        # last 7 days
--since 2026-02-24T09:00:00Z  # exact ISO timestamp
--until 2026-02-24T17:00:00Z  # end time (default: now)
```

### Result limit
```bash
-n 1000   # increase from default 100 to get full function traces
```

### By severity (safe to combine with -n and --since)
```bash
--level error    # errors only
--level warning  # warnings only
```

## Content Filtering — Always Use grep/jq Locally

```bash
# Full trace for a specific email
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "someone@example.com"

# All sync outcome lines (created/updated)
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep -E "Sync\] (created|updated)"

# Errors only
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "❌"

# personalNote2 or specific field in outcome
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "personalNote2"

# BDR assignment lines
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "BDR\]"

# All lines for a specific checkout_started event
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "checkout_started"
```

## Recipes

**Full trace for a specific email (all processing steps):**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "someone@example.com"
```

**All sync outcomes with fields (last 24h):**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep -E "\[Sync\] (created|updated)"
```

**Errors in the last hour:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 1h -n 1000 | jq -r '.message' | grep "❌"
```

**Recent 422 errors (Outreach Unprocessable Entity) — HTTP status filter is safe:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h --level error -n 200 | jq -r '.message'
```

**Event type breakdown:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "Received:" | grep -oE "(checkout_started|payment_info_entered|order_completed|user_signed_up)" | sort | uniq -c | sort -rn
```

## Outreach → CIO Webhook (`/api/webhooks/outreach-to-cio`)

**IMPORTANT: This route receives very high volume from Outreach's ghost/reconciliation events.** These fire silently (200, no log output, ~8ms, no external calls) for every Outreach activity. They are noise — filter them out unless you specifically need to debug the raw event volume.

Only these log prefixes indicate something actually happened:
- `📨 [Outreach→CIO]` — relevant change detected (owner or stage changed)
- `✅ [OutreachToCio]` — BDR or stage synced to CIO successfully
- `⚠️ [OutreachToCio]` — owner user not found in Outreach
- `❌ [OutreachToCio]` — sync failed
- `📋 [OutreachToCio]` — per-prospect summary line

**All actual Outreach→CIO sync activity (default recipe for this route):**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "OutreachToCio\|Outreach→CIO"
```

**Only successful syncs:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "✅ \[OutreachToCio\]"
```

**Failed syncs or errors:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "❌ \[OutreachToCio\]"
```

**BDR assignment changes specifically:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "BDR synced"
```

**Stage changes specifically:**
```bash
vercel logs --scope wanderdev --project growth --no-follow --json --since 24h -n 1000 | jq -r '.message' | grep "Stage synced"
```

## Project Info

- **Scope**: `wanderdev`
- **Project**: `growth`
- **Production URL**: `growth-red.vercel.app`
- **Main route to monitor**: `/api/workflows/cio-to-outreach`
- **Latest deployment ID**: `dpl_8Ghw8LPzzQ9goMTqxdshQBc5Wyud` (update as needed)

## Parsing JSON Output

Each log line is a JSON object with these fields:
- `timestamp` — Unix ms
- `message` — log text
- `level` — info / warning / error / fatal
- `requestPath` — e.g. `/api/workflows/cio-to-outreach`
- `responseStatusCode` — HTTP status (0 = in-flight/no response)
- `source` — serverless / edge-function
- `deploymentId` — which deployment handled the request
