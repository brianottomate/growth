'use client'

import { MessageCircle } from 'lucide-react'
import { useAskClaudePanel } from '@/context/AskClaudeContext'
import { cn } from '@/lib/utils'

interface AskClaudeTriggerProps {
  className?: string
}

export function AskClaudeTrigger({ className }: AskClaudeTriggerProps) {
  const { togglePanel, isOpen } = useAskClaudePanel()

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center',
        'transition-colors',
        isOpen
          ? 'bg-accent-blue text-white'
          : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
        className
      )}
      aria-label="Ask Claude"
      aria-expanded={isOpen}
      data-testid="ask-claude-trigger"
    >
      <MessageCircle className="w-5 h-5" />
    </button>
  )
}
