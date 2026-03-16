'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Ask a question about your marketing data...',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return

    onSend(trimmed)
    setValue('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="border-t border-border p-4 flex gap-2"
      data-testid="chat-input-container"
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className={cn(
          'flex-1 bg-bg-secondary border border-border rounded-lg px-4 py-2',
          'text-sm text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent-blue',
          'disabled:opacity-50'
        )}
        data-testid="chat-input"
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || isLoading}
        className={cn(
          'w-10 h-10 rounded-lg bg-accent-blue text-white',
          'flex items-center justify-center',
          'hover:bg-accent-blue/80 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        aria-label="Send message"
        data-testid="chat-send-button"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  )
}
