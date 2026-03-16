'use client'

import { LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useSettings } from '@/hooks/use-settings'
import { useFixedCosts } from '@/hooks/use-fixed-costs'
import { ProfileSection } from '@/components/settings/ProfileSection'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { DataSettings } from '@/components/settings/DataSettings'
import { FixedCostsSettings } from '@/components/settings/FixedCostsSettings'
import { SettingsSection } from '@/components/settings/SettingsSection'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { settings, isLoading, updateSettings } = useSettings()
  const { costs, totalMonthly, isLoading: costsLoading, updateCost } = useFixedCosts()

  return (
    <div className="max-w-2xl" data-testid="settings-page">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Settings</h1>

      {/* Profile Section */}
      <ProfileSection user={user} />

      {/* Appearance Settings */}
      <AppearanceSettings />

      {/* Notification Settings */}
      <NotificationSettings
        settings={settings}
        onUpdate={updateSettings}
        isLoading={isLoading}
      />

      {/* Data Settings */}
      <DataSettings
        settings={settings}
        onUpdate={updateSettings}
        isLoading={isLoading}
      />

      {/* Fixed Costs Settings */}
      <FixedCostsSettings
        costs={costs}
        totalMonthly={totalMonthly}
        isLoading={costsLoading}
        onUpdate={updateCost}
      />

      {/* Account Section */}
      <SettingsSection title="Account">
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-2 bg-status-red/10 border border-status-red/20 text-status-red px-4 py-2 rounded-lg hover:bg-status-red/20 transition-colors"
          data-testid="sign-out-button"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </SettingsSection>
    </div>
  )
}
