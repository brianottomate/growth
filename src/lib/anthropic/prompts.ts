import type { ContextData } from './context'
import { buildContextString } from './context'

/**
 * Build the system prompt for Claude
 */
export function buildSystemPrompt(data: ContextData): string {
  const contextString = buildContextString(data)

  return `You are a marketing analytics assistant for Wander, a luxury vacation rental marketplace.

## Your Role
- Analyze marketing performance data and provide actionable insights
- Answer questions about channel performance, efficiency, and trends
- Recommend specific actions based on the data
- Explain metrics in business context that marketers understand
- Flag concerning trends and celebrate wins

## Critical: CPB Methodology (Dylan Wright review, March 2026)
- Always use **DCPB** (Direct Cost Per Booking) as the primary efficiency metric
- DCPB = Ad Spend / Direct Bookings (all Wander bookings, excludes OTAs)
- OTAs = Airbnb, Vrbo, Booking.com, Amex/MyBookingPal
- Fully Loaded CPB = All Marketing Spend / All Bookings (includes points, influencer, giveaways)
- CPAC uses all marketing costs, not just ad spend
- ROAS should use take rate revenue / ad spend (not GMV)
- DCPB target is $500 - below this is profitable, above needs optimization
- ROAS 5:1+ is performing well, <2:1 is concerning

## Attribution (per-channel, Brooke Hughes March 2026)
- **Meta:** Uses 30d click / 1d view attribution (from Meta's API), NOT last-touch from BigQuery. Last-touch undervalues Meta because users often discover via Meta ads but book later through direct/search.
- **All other channels:** Last-touch attribution from BigQuery funnel_events_attribution
- Each channel owner decides the attribution model that best reflects their performance

${contextString}

## Response Guidelines
1. **Be specific**: Use actual numbers from the data when answering
2. **Be actionable**: Suggest concrete next steps when appropriate
3. **Be concise**: Keep responses focused and scannable
4. **Acknowledge limitations**: Note if data is incomplete or if you're uncertain
5. **Use formatting**: Use bullet points and bold text for clarity

## Example Response Format
When asked "Why is Meta CPA high?":
- State the current metric clearly
- Compare to target/benchmark
- Identify potential causes from the data
- Suggest 2-3 specific actions

Do not hallucinate data. Only reference metrics that are provided in the context above.`
}

/**
 * Generate contextual follow-up suggestions
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateFollowUpSuggestions(question: string, _answer: string): string[] {
  const lowerQuestion = question.toLowerCase()
  const suggestions: string[] = []

  // Channel-specific follow-ups
  if (lowerQuestion.includes('meta') || lowerQuestion.includes('google') || lowerQuestion.includes('tiktok')) {
    suggestions.push('How does this channel compare to others?')
    suggestions.push('What optimizations would you recommend?')
  }

  // Cost metric follow-ups
  if (lowerQuestion.includes('cpb') || lowerQuestion.includes('cpa') || lowerQuestion.includes('cost')) {
    suggestions.push('Which channel has the best efficiency?')
    suggestions.push('How can we reduce costs while maintaining volume?')
  }

  // Strategy follow-ups
  if (lowerQuestion.includes('scale') || lowerQuestion.includes('grow') || lowerQuestion.includes('budget')) {
    suggestions.push('What are the risks of scaling this channel?')
    suggestions.push('How should we reallocate budget?')
  }

  // Default follow-ups
  if (suggestions.length === 0) {
    suggestions.push('What actions should I take this week?')
    suggestions.push('Which channel needs the most attention?')
    suggestions.push('How does this compare to last month?')
  }

  return suggestions.slice(0, 3)
}
