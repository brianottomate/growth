#!/usr/bin/env bash
# One-command yeet: staging by default, YEET=prod ./deploy.sh for production.
# Run from anywhere; needs Node 24+ and an authenticated `vercel` CLI.
set -euo pipefail
cd "$(dirname "$0")"

node -e 'const M=+process.versions.node.split(".")[0]; if (M<24) { console.error(`eve needs Node 24+, you have ${process.versions.node} (try: nvm use 24)`); process.exit(1); }'

npm install --no-audit --no-fund
npm run typecheck

# Model credential: env wins, growth/.env fallback.
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' ../../.env | cut -d= -f2- | tr -d '"')
  export ANTHROPIC_API_KEY
fi
[ -n "$ANTHROPIC_API_KEY" ] || { echo "No ANTHROPIC_API_KEY found"; exit 1; }

# Optional: propagate to Doppler (PUSH_TO_DOPPLER=1, override project/config as needed).
if [ "${PUSH_TO_DOPPLER:-0}" = "1" ]; then
  doppler secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    --project "${DOPPLER_PROJECT:-growth}" --config "${DOPPLER_CONFIG:-stg}"
fi

# Own Vercel project — do NOT link to the growth Next.js project.
vercel link --yes --project gdpr-scan-agent
printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY production 2>/dev/null || true
printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY preview 2>/dev/null || true

if [ "${YEET:-staging}" = "prod" ]; then
  URL=$(vercel deploy --prod)
else
  URL=$(vercel deploy)
fi

echo ""
echo "Deployed: $URL"
echo "Health:   curl $URL/eve/v1/health"
echo "Talk:     npx eve dev $URL   (route auth: Vercel OIDC — you qualify as a project member)"
echo "Cron:     schedules/daily-scan.md registers as Vercel Cron automatically"
