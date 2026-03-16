'use client'

import { useAskClaudePanel } from '@/context/AskClaudeContext'
import { cn } from '@/lib/utils'

interface MainContentProps {
  children: React.ReactNode
}

export function MainContent({ children }: MainContentProps) {
  const { isOpen } = useAskClaudePanel()

  return (
    <div
      className={cn(
        'flex-1 lg:ml-16 flex flex-col min-h-screen',
        isOpen && 'lg:mr-[420px]'
      )}
    >
      {children}
    </div>
  )
}
