'use client'

import { useRef, useEffect } from 'react'
import { X, Loader2, RotateCcw } from 'lucide-react'
import { useAskClaudePanel } from '@/context/AskClaudeContext'
import { useAskClaude } from '@/hooks/use-ask-claude'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { SuggestedPrompts } from './SuggestedPrompts'
import { cn } from '@/lib/utils'

export function AskClaudePanel() {
  const { isOpen, closePanel } = useAskClaudePanel()
  const { messages, isLoading, sendMessage, clearMessages } = useAskClaude()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Only auto-scroll during loading (streaming)
  useEffect(() => {
    if (isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isLoading, messages])

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closePanel()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closePanel])

  const handleSendMessage = (content: string) => {
    sendMessage(content)
  }

  if (!isOpen) {
    return null
  }

  return (
      <div
        className={cn(
          'fixed right-0 top-0 w-[420px] h-screen',
          'bg-bg-primary border-l border-border',
          'flex flex-col z-20'
        )}
        data-testid="ask-claude-panel"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Ask Claude</h2>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="New chat"
                title="New chat"
                data-testid="ask-claude-new-chat"
              >
                <RotateCcw className="w-4 h-4 text-text-muted" />
              </button>
            )}
            <button
              onClick={closePanel}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close panel"
              data-testid="ask-claude-close"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Show suggested prompts if no messages */}
          {messages.length === 0 && (
            <SuggestedPrompts onSelect={handleSendMessage} disabled={isLoading} />
          )}

          {/* Messages */}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start" data-testid="chat-loading">
              <div className="bg-bg-card border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Claude is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
      </div>
  )
}
