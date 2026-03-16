'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from './use-toast'
import { useDateRange } from '@/providers/DateRangeProvider'
import type { AskClaudeMessage } from '@/types'

interface UseAskClaudeResult {
  messages: AskClaudeMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

export function useAskClaude(): UseAskClaudeResult {
  const [messages, setMessages] = useState<AskClaudeMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { getDays } = useDateRange()

  // Use ref to access current messages in callback without causing re-renders
  const messagesRef = useRef<AskClaudeMessage[]>(messages)

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return

      // Add user message with unique ID
      const userMessage: AskClaudeMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/ask-claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: content,
            conversationHistory: [...messagesRef.current, userMessage],
            context: {},
            days: getDays() ?? 9999, // Pass selected date range
          }),
        })

        const result = await response.json()

        if (result.error) {
          setError(result.error.message)
          toast.error(result.error.message)
        } else if (result.data) {
          const assistantMessage: AskClaudeMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: result.data.answer,
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }
      } catch {
        const errorMessage = 'Failed to get response. Please try again.'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, toast, getDays]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  }
}
