'use client'

import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastData {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

const toastStyles: Record<ToastType, string> = {
  success: 'bg-status-green/10 border-status-green/20 text-status-green',
  error: 'bg-status-red/10 border-status-red/20 text-status-red',
  info: 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue',
}

const toastIcons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: AlertCircle,
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = toastIcons[toast.type]
  const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000)

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, duration, onDismiss])

  return (
    <div
      className={cn(
        'rounded-lg px-4 py-3 shadow-lg border flex items-center gap-3 min-w-[300px] animate-in slide-in-from-right-full',
        toastStyles[toast.type]
      )}
      role="alert"
      data-testid={`toast-${toast.type}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 hover:opacity-70 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
