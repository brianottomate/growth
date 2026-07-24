#!/usr/bin/env bash
# One-command yeet: staging by default, YEET=prod ./deploy.sh for production.
# Run from anywhere; needs Node 24+ and an authenticated `vercel` CLI.
set -euo pipefail
cd "$(dirname "$0")"

node -e 'const M=+process.versions.node.split(".")[0]; if (M<24) { console.error(`eve needs Node 24+, you have ${process.versions.node} (try: nvm use 24)`); process.exit(1); }'

bun install
bun run typecheck
bun run test

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
#
# --scope is NOT optional. This directory has no .vercel of its own and growth's
# root link does not cover a subdirectory, so an unscoped `vercel link` falls back
# to the CLI's default team — which on this machine is a personal account. That
# would stand up a Wander compliance scanner, and a production Anthropic key,
# outside the org. Override only if the org slug changes.
VERCEL_SCOPE="${VERCEL_SCOPE:-wanderdev}"
vercel link --yes --scope "$VERCEL_SCOPE" --project gdpr-scan-agent

# Failures here are reported, not swallowed: `|| true` on an env push meant a
# rejected credential surfaced only later, as a runtime auth error in the agent.
for target in production preview; do
  if printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY "$target" --scope "$VERCEL_SCOPE" 2>/dev/null; then
    echo "  set ANTHROPIC_API_KEY ($target)"
  else
    echo "  ANTHROPIC_API_KEY ($target) already set or rejected — verify with: vercel env ls --scope $VERCEL_SCOPE"
  fi
done

if [ "${YEET:-staging}" = "prod" ]; then
  URL=$(vercel deploy --prod --scope "$VERCEL_SCOPE")
else
  URL=$(vercel deploy --scope "$VERCEL_SCOPE")
fi

echo ""
echo "Deployed: $URL"
echo "Health:   curl $URL/eve/v1/health"
echo "Talk:     npx eve dev $URL   (route auth: Vercel OIDC — you qualify as a project member)"
echo "Cron:     schedules/daily-scan.md registers as Vercel Cron automatically"
