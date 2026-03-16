import type { Channel } from '@/types'

export interface ChannelDisplayConfig {
  id: Channel
  name: string
  abbreviation: string
  color: string
}

export const CHANNEL_DISPLAY_CONFIG: Record<Channel, ChannelDisplayConfig> = {
  meta: { id: 'meta', name: 'Meta', abbreviation: 'MT', color: 'bg-blue-600' },
  google: { id: 'google', name: 'Google', abbreviation: 'GO', color: 'bg-red-500' },
  pinterest: { id: 'pinterest', name: 'Pinterest', abbreviation: 'PI', color: 'bg-rose-600' },
  tiktok: { id: 'tiktok', name: 'TikTok', abbreviation: 'TT', color: 'bg-slate-800' },
  microsoft: { id: 'microsoft', name: 'Microsoft', abbreviation: 'MS', color: 'bg-cyan-600' },
  criteo: { id: 'criteo', name: 'Criteo', abbreviation: 'CR', color: 'bg-orange-500' },
  mountain: { id: 'mountain', name: 'Mountain', abbreviation: 'MN', color: 'bg-emerald-600' },
  influencer: { id: 'influencer', name: 'Influencer', abbreviation: 'IN', color: 'bg-purple-500' },
  lifecycle: { id: 'lifecycle', name: 'Lifecycle', abbreviation: 'LC', color: 'bg-teal-500' },
  demand_sales: { id: 'demand_sales', name: 'Demand Sales', abbreviation: 'DS', color: 'bg-amber-600' },
  direct_mail: { id: 'direct_mail', name: 'Direct Mail', abbreviation: 'DM', color: 'bg-indigo-500' },
  affiliate: { id: 'affiliate', name: 'Affiliate', abbreviation: 'AF', color: 'bg-lime-600' },
  seo: { id: 'seo', name: 'SEO', abbreviation: 'SE', color: 'bg-sky-500' },
  organic: { id: 'organic', name: 'Organic', abbreviation: 'OR', color: 'bg-green-600' },
  airbnb: { id: 'airbnb', name: 'Airbnb', abbreviation: 'AB', color: 'bg-rose-500' },
  vrbo: { id: 'vrbo', name: 'Vrbo', abbreviation: 'VB', color: 'bg-slate-600' },
  booking: { id: 'booking', name: 'Booking.com', abbreviation: 'BK', color: 'bg-blue-700' },
  amex: { id: 'amex', name: 'Amex (MyBookingPal)', abbreviation: 'AX', color: 'bg-blue-800' },
  other: { id: 'other', name: 'Other', abbreviation: 'OT', color: 'bg-gray-500' },
}

/**
 * Get display config for a channel
 */
export function getChannelConfig(channel: Channel): ChannelDisplayConfig {
  return CHANNEL_DISPLAY_CONFIG[channel]
}

/**
 * Get all channels in display order (by default: alphabetical)
 */
export function getAllChannels(): Channel[] {
  return Object.keys(CHANNEL_DISPLAY_CONFIG) as Channel[]
}
