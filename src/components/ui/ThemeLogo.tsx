'use client'

import Image from 'next/image'
import { useTheme } from '@/providers/ThemeProvider'

interface ThemeLogoProps {
  width?: number
  height?: number
  className?: string
}

export function ThemeLogo({ width = 48, height = 48, className }: ThemeLogoProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Image
      src={resolvedTheme === 'dark' ? '/wander-logo-dark.png' : '/wander-logo-light.png'}
      alt="Wander"
      width={width}
      height={height}
      className={className}
      priority
    />
  )
}
