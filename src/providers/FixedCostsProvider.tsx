'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface FixedCostsContextType {
  includeFixedCosts: boolean
  setIncludeFixedCosts: (include: boolean) => void
}

const FixedCostsContext = createContext<FixedCostsContextType | null>(null)

interface FixedCostsProviderProps {
  children: ReactNode
  defaultInclude?: boolean
}

export function FixedCostsProvider({ children, defaultInclude = true }: FixedCostsProviderProps) {
  const [includeFixedCosts, setIncludeFixedCosts] = useState(defaultInclude)

  return (
    <FixedCostsContext.Provider value={{ includeFixedCosts, setIncludeFixedCosts }}>
      {children}
    </FixedCostsContext.Provider>
  )
}

export function useFixedCostsToggle() {
  const context = useContext(FixedCostsContext)
  if (!context) {
    throw new Error('useFixedCostsToggle must be used within a FixedCostsProvider')
  }
  return context
}
