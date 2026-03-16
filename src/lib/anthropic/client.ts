import Anthropic from '@anthropic-ai/sdk'

// Lazy initialization to avoid errors when API key is not set
let anthropicClient: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }

    anthropicClient = new Anthropic({
      apiKey,
    })
  }

  return anthropicClient
}

// Model configuration
export const ANTHROPIC_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
} as const

export type AnthropicModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-haiku-4-5-20251001'
