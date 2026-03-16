'use client'

import { useInsights } from '@/hooks/use-insights'
import { useDashboard } from '@/hooks/use-dashboard'
import type { Insight, DashboardSummary } from '@/types'

interface SuggestedPrompt {
  icon: string
  text: string
  priority: number
}

function generateSmartPrompts(insights: Insight[] | null, dashboardData: DashboardSummary | null): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = []

  if (!insights || insights.length === 0) {
    // Fallback to generic prompts
    return [
      { icon: '📊', text: 'Give me a summary of today\'s performance', priority: 1 },
      { icon: '📈', text: 'Which channel should I scale?', priority: 2 },
      { icon: '💡', text: 'What optimizations do you recommend?', priority: 3 },
      { icon: '🎯', text: 'How are we tracking against targets?', priority: 4 },
    ]
  }

  // Find action needed insights (highest priority)
  const actionNeeded = insights.filter(i => i.severity === 'action_needed')
  const opportunities = insights.filter(i => i.severity === 'opportunity')
  const declining = insights.filter(i => i.type === 'trend_declining')

  // Generate prompts based on actual insights
  if (actionNeeded.length > 0) {
    const topIssue = actionNeeded[0]
    if (topIssue.channel) {
      prompts.push({
        icon: '🚨',
        text: `Why is ${topIssue.channel.charAt(0).toUpperCase() + topIssue.channel.slice(1)} ${topIssue.metric.name} so high?`,
        priority: 1,
      })
    } else {
      prompts.push({
        icon: '🚨',
        text: `What's causing the ${topIssue.title.toLowerCase()}?`,
        priority: 1,
      })
    }
  }

  // Add opportunity-based prompt
  if (opportunities.length > 0) {
    const topOpp = opportunities[0]
    if (topOpp.channel) {
      prompts.push({
        icon: '🚀',
        text: `Should I scale ${topOpp.channel.charAt(0).toUpperCase() + topOpp.channel.slice(1)}? It's performing well.`,
        priority: 2,
      })
    }
  }

  // Add declining trend prompt
  if (declining.length > 0) {
    const topDecline = declining[0]
    if (topDecline.channel) {
      prompts.push({
        icon: '📉',
        text: `Why is ${topDecline.channel.charAt(0).toUpperCase() + topDecline.channel.slice(1)} trending down?`,
        priority: 3,
      })
    }
  }

  // Add CPB prompt if above target
  if (dashboardData?.efficiency?.cpb && dashboardData?.targets?.cpbTarget && dashboardData.efficiency.cpb > dashboardData.targets.cpbTarget) {
    prompts.push({
      icon: '💰',
      text: 'How can I reduce blended CPB?',
      priority: 4,
    })
  }

  // Always include a general action prompt
  prompts.push({
    icon: '✅',
    text: 'What should I focus on this week?',
    priority: 5,
  })

  // Sort by priority and take top 4
  return prompts.sort((a, b) => a.priority - b.priority).slice(0, 4)
}

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void
  disabled?: boolean
}

export function SuggestedPrompts({ onSelect, disabled }: SuggestedPromptsProps) {
  const { insights } = useInsights()
  const { data: dashboardData } = useDashboard()

  const prompts = generateSmartPrompts(insights, dashboardData)

  return (
    <div className="space-y-2" data-testid="suggested-prompts">
      <p className="text-xs text-text-muted uppercase tracking-wide mb-3">
        Suggested questions
      </p>
      {prompts.map((prompt, index) => (
        <button
          key={`${prompt.text}-${index}`}
          onClick={() => onSelect(prompt.text)}
          disabled={disabled}
          className="w-full text-left px-4 py-3 rounded-lg bg-bg-card border border-border hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid={`suggested-prompt-${index}`}
        >
          <span className="mr-2">{prompt.icon}</span>
          <span className="text-sm text-text-primary">{prompt.text}</span>
        </button>
      ))}
    </div>
  )
}
