'use client'

import { SettingsSection } from './SettingsSection'
import { Toggle } from '@/components/ui/Toggle'
import type { UserSettings } from '@/types/settings'

interface NotificationSettingsProps {
  settings: UserSettings | null
  onUpdate: (updates: Partial<UserSettings>) => void
  isLoading: boolean
}

export function NotificationSettings({
  settings,
  onUpdate,
  isLoading,
}: NotificationSettingsProps) {
  return (
    <SettingsSection title="Notifications">
      <div className="space-y-4">
        <Toggle
          checked={settings?.emailInsightsDigest ?? true}
          onChange={(checked) => onUpdate({ emailInsightsDigest: checked })}
          disabled={isLoading || !settings}
          label="Email Insights Digest"
          description="Get a daily summary of key insights"
        />

        <Toggle
          checked={settings?.emailCpbAlert ?? false}
          onChange={(checked) => onUpdate({ emailCpbAlert: checked })}
          disabled={isLoading || !settings}
          label="CPB Threshold Alerts"
          description="Get notified when CPB exceeds target"
        />
      </div>
    </SettingsSection>
  )
}
