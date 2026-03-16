import type { DashboardSummary } from '@/types'

interface SlackBlock {
  type: string
  text?: { type: string; text: string; emoji?: boolean }
  elements?: Array<{ type: string; text: string }>
  fields?: Array<{ type: string; text: string }>
}

function fmt(n: number, prefix = '$'): string {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`
  return `${prefix}${n.toFixed(0)}`
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatDigestBlocks(summary: DashboardSummary): SlackBlock[] {
  const { totals, efficiency, period, channels } = summary
  const dcpbStatus = efficiency.directCpb <= 500 ? 'on track' : 'above target'
  const dcpbEmoji = efficiency.directCpb <= 500 ? ':white_check_mark:' : ':warning:'

  // Top 5 channels by spend
  const topChannels = [...channels]
    .filter(c => (c.spend ?? 0) > 0)
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 5)
    .map(c => `${c.channel}: ${fmt(c.spend ?? 0)}`)
    .join(' · ')

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Growth Tracker MTD — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Marketing Spend*\n${fmt(totals.totalMarketingSpend)}` },
        { type: 'mrkdwn', text: `*Ad Spend*\n${fmt(totals.adSpend)}` },
        { type: 'mrkdwn', text: `*Bookings*\n${fmtNum(totals.bookings)} (${fmtNum(totals.otaBookings)} OTA)` },
        { type: 'mrkdwn', text: `*GMV*\n${fmt(totals.gmv)}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*DCPB*\n${fmt(efficiency.directCpb)} ${dcpbEmoji} (target: $500)` },
        { type: 'mrkdwn', text: `*CPAC*\n${fmt(efficiency.cpac)}` },
        { type: 'mrkdwn', text: `*ROAS*\n${efficiency.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `*Fully Loaded CPB*\n${fmt(efficiency.fullyLoadedCpb)}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Channels:* ${topChannels}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${period.daysElapsed} of ${period.daysInMonth} days · ${dcpbStatus} · <https://wander-growth-tracker-production.up.railway.app|Open Dashboard>`,
        },
      ],
    },
  ]
}

export async function postSlackDigest(summary: DashboardSummary): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_DIGEST_CHANNEL_ID

  if (!token || !channel) {
    console.log('[Digest] Slack not configured (missing SLACK_BOT_TOKEN or SLACK_DIGEST_CHANNEL_ID)')
    return false
  }

  const blocks = formatDigestBlocks(summary)

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      blocks,
      text: `Growth Tracker — ${summary.period.month}: ${summary.totals.bookings} bookings, DCPB ${summary.efficiency.directCpb > 0 ? '$' + summary.efficiency.directCpb.toFixed(0) : '—'}`,
    }),
  })

  const data = await response.json()

  if (!data.ok) {
    console.error('[Digest] Slack API error:', data.error)
    return false
  }

  console.log(`[Digest] Posted to Slack channel ${channel}`)
  return true
}
