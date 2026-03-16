'use client'

import { SettingsSection } from './SettingsSection'
import { Select } from '@/components/ui/Select'
import {
  DATE_RANGE_OPTIONS,
  REFRESH_INTERVAL_OPTIONS,
} from '@/types/settings'
import type { UserSettings, DateRangeOption, RefreshIntervalOption } from '@/types/settings'

interface DataSettingsProps {
  settings: UserSettings | null
  onUpdate: (updates: Partial<UserSettings>) => void
  isLoading: boolean
}

export function DataSettings({
  settings,
  onUpdate,
  isLoading,
}: DataSettingsProps) {
  return (
    <SettingsSection title="Data Preferences">
      <div className="space-y-4">
        <Select
          value={settings?.defaultDateRange ?? '30'}
          onChange={(value) =>
            onUpdate({ defaultDateRange: value as DateRangeOption })
          }
          options={DATE_RANGE_OPTIONS}
          label="Default Date Range"
          disabled={isLoading || !settings}
        />

        <Select
          value={settings?.autoRefreshInterval ?? '60'}
          onChange={(value) =>
            onUpdate({ autoRefreshInterval: value as RefreshIntervalOption })
          }
          options={REFRESH_INTERVAL_OPTIONS}
          label="Auto-refresh Interval"
          disabled={isLoading || !settings}
        />
      </div>
    </SettingsSection>
  )
}
