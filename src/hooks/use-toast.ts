'use client'

import { useToastContext } from '@/components/ui/ToastProvider'

export function useToast() {
  const { showToast, dismissToast } = useToastContext()

  return {
    success: (message: string, duration?: number) =>
      showToast('success', message, duration),
    error: (message: string, duration?: number) =>
      showToast('error', message, duration),
    info: (message: string, duration?: number) =>
      showToast('info', message, duration),
    dismiss: dismissToast,
  }
}
