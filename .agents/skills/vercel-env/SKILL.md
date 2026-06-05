---
name: vercel-env
description: Read, set, and manage Vercel environment variables for the wander/growth project. Use when the user asks about env vars, secrets, config, or needs to update a Vercel environment variable.
allowed-tools: Bash
---

# Vercel Env

Manage environment variables for the `wanderdev/growth` Vercel project using the Vercel CLI.

## Project Info

- **Scope**: `wanderdev`
- **Project**: `growth`
- **Environments**: `production`, `preview`, `development`

## Prerequisites — Project Must Be Linked

If you get "not linked to a project" errors, run:
```bash
vercel link --yes --scope wanderdev
```

## Base Commands

### List all env vars (shows names + environments, values are encrypted)
```bash
vercel env ls
```

### Filter by environment
```bash
vercel env ls production
vercel env ls preview
vercel env ls development
```

### Pull env vars to a file (decrypts values)
```bash
vercel env pull /tmp/vercel-prod-env --environment production --yes
```

## Reading a Specific Value

`vercel env ls` only shows names. To read a specific value, pull to a temp file and grep:
```bash
vercel env pull /tmp/vercel-prod-env --environment production --yes 2>&1 && grep MY_VAR /tmp/vercel-prod-env
```

## Adding / Updating an Env Var

**IMPORTANT: Values with special characters (`$`, `` ` ``, `'`, `!`, `{`, `}`) must be written to a temp file and piped via stdin — never passed as shell arguments.**

### Safe pattern for any value (including secrets with special chars):
```bash
# 1. Write value to temp file (no shell interpolation)
node -e "process.stdout.write('the-secret-value')" > /tmp/env-val.txt
# or extract from local .env:
node -e "const fs=require('fs'); const e=fs.readFileSync('.env','utf8'); const m=e.match(/MY_VAR=\"([^\"]+)\"/); process.stdout.write(m[1]);" > /tmp/env-val.txt

# 2. Remove old value (if updating)
vercel env rm MY_VAR production --yes

# 3. Add new value from file
vercel env add MY_VAR production < /tmp/env-val.txt
```

### Simple values (no special chars) — can use echo:
```bash
echo -n "simple-value" | vercel env add MY_VAR production
```

## Removing an Env Var
```bash
vercel env rm MY_VAR production --yes
```

## Syncing Local .env → Vercel Prod

To make Vercel prod match your local `.env` for a specific key:
```bash
# Extract from local .env (handles quoted values)
node -e "const fs=require('fs'); const e=fs.readFileSync('.env','utf8'); const m=e.match(/MY_VAR=\"([^\"]+)\"/); process.stdout.write(m[1]);" > /tmp/env-val.txt

# Update Vercel
vercel env rm MY_VAR production --yes
vercel env add MY_VAR production < /tmp/env-val.txt

# Verify they match
vercel env pull /tmp/check --environment production --yes 2>&1 && grep MY_VAR /tmp/check
```

## Verifying a Change Took Effect

After updating, always verify:
```bash
vercel env pull /tmp/vercel-verify --environment production --yes 2>&1 && grep MY_VAR /tmp/vercel-verify
```

**Note**: Env var changes require a Vercel redeploy to take effect in production. Trigger via the Vercel dashboard or `vercel --prod`.

## Common Env Vars in This Project

| Variable | Purpose |
|---|---|
| `OUTREACH_WEBHOOK_SECRET` | HMAC secret for verifying Outreach webhook signatures |
| `OUTREACH_S2S_GUID` | Outreach S2S app GUID |
| `OUTREACH_PRIVATE_KEY` | RSA private key for S2S JWT signing |
| `OUTREACH_INSTALL_ID` | Outreach app installation ID |
| `OUTREACH_OAUTH_CLIENT_ID` | Outreach OAuth client ID |
| `OUTREACH_OAUTH_CLIENT_SECRET` | Outreach OAuth client secret |
| `OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK` | Set to `1` to bypass signature verification (debugging only) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Auth session signing secret |
| `NEXT_PUBLIC_BASE_URL` | Public base URL (e.g. `https://growth-red.vercel.app`) |
