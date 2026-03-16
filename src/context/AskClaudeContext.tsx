'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AskClaudeContextValue {
  isOpen: boolean
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
}

const AskClaudeContext = createContext<AskClaudeContextValue | null>(null)

export function useAskClaudePanel() {
  const context = useContext(AskClaudeContext)
  if (!context) {
    throw new Error('useAskClaudePanel must be used within AskClaudeProvider')
  }
  return context
}

interface AskClaudeProviderProps {
  children: ReactNode
}

export function AskClaudeProvider({ children }: AskClaudeProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const openPanel = useCallback(() => setIsOpen(true), [])
  const closePanel = useCallback(() => setIsOpen(false), [])
  const togglePanel = useCallback(() => setIsOpen((prev) => !prev), [])

  return (
    <AskClaudeContext.Provider
      value={{ isOpen, openPanel, closePanel, togglePanel }}
    >
      {children}
    </AskClaudeContext.Provider>
  )
}
