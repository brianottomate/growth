export type DateRangeOption = '1' | '7' | '14' | '30' | '60' | '90' | 'mtd' | 'custom' | 'all'
export type RefreshIntervalOption = '15' | '30' | '60' | '240' | 'never'

export interface UserSettings {
  userId: string
  emailInsightsDigest: boolean
  emailCpbAlert: boolean
  defaultDateRange: DateRangeOption
  autoRefreshInterval: RefreshIntervalOption
  updatedAt: string
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'userId' | 'updatedAt'> = {
  emailInsightsDigest: true,
  emailCpbAlert: false,
  defaultDateRange: '30',
  autoRefreshInterval: '60',
}

export const DATE_RANGE_OPTIONS = [
  { value: '1' as const, label: 'Today' },
  { value: '7' as const, label: 'Last 7 Days' },
  { value: '14' as const, label: 'Last 14 Days' },
  { value: '30' as const, label: 'Last 30 Days' },
  { value: '60' as const, label: 'Last 60 Days' },
  { value: '90' as const, label: 'Last 90 Days' },
  { value: 'mtd' as const, label: 'Month to Date' },
  { value: 'custom' as const, label: 'Custom Range' },
  { value: 'all' as const, label: 'All Time' },
]

export const REFRESH_INTERVAL_OPTIONS = [
  { value: '15' as const, label: 'Every 15 Minutes' },
  { value: '30' as const, label: 'Every 30 Minutes' },
  { value: '60' as const, label: 'Every Hour' },
  { value: '240' as const, label: 'Every 4 Hours' },
  { value: 'never' as const, label: 'Manual Only' },
]
