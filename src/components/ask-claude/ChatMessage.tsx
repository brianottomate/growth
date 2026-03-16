import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format'
import type { AskClaudeMessage } from '@/types'

interface ChatMessageProps {
  message: AskClaudeMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      data-testid={`chat-message-${message.role}`}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg p-3',
          isUser
            ? 'bg-accent-blue/10 border border-accent-blue/20'
            : 'bg-bg-card border border-border'
        )}
      >
        {/* Role label */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              'text-xs font-medium',
              isUser ? 'text-accent-blue' : 'text-text-muted'
            )}
          >
            {isUser ? 'You' : 'Claude'}
          </span>
          <span className="text-xs text-text-muted">
            {formatDate(new Date(message.timestamp), { format: 'relative' })}
          </span>
        </div>

        {/* Content */}
        {isUser ? (
          <div className="text-sm text-text-primary whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <div className="text-sm text-text-primary prose prose-sm prose-invert max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => (
                  <code className="bg-white/10 px-1 py-0.5 rounded text-xs">{children}</code>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
