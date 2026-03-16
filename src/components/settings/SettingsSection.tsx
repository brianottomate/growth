import { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div
      className="bg-bg-card border border-border rounded-lg p-6 mb-6"
      data-testid={`settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}
