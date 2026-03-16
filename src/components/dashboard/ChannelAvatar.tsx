import { cn } from '@/lib/utils'
import { getChannelConfig } from '@/lib/channel-config'
import type { Channel } from '@/types'
import {
  SiMeta,
  SiGoogle,
  SiTiktok,
  SiPinterest,
  SiAirbnb,
} from 'react-icons/si'
import { BsMicrosoft } from 'react-icons/bs'
import {
  HiUsers,
  HiMagnifyingGlass,
  HiEnvelope,
  HiLink,
  HiGlobeAlt,
  HiEllipsisHorizontalCircle,
  HiHome,
  HiBuildingOffice2,
} from 'react-icons/hi2'
import { TbTargetArrow, TbMailbox } from 'react-icons/tb'
import { LuMountain } from 'react-icons/lu'

interface ChannelAvatarProps {
  channel: Channel
  className?: string
}

// Map channels to their icons
const CHANNEL_ICONS: Partial<Record<Channel, React.ComponentType<{ className?: string }>>> = {
  meta: SiMeta,
  google: SiGoogle,
  tiktok: SiTiktok,
  pinterest: SiPinterest,
  microsoft: BsMicrosoft,
  mountain: LuMountain,
  influencer: HiUsers,
  seo: HiMagnifyingGlass,
  lifecycle: HiEnvelope,
  criteo: TbTargetArrow,        // Retargeting = target icon
  direct_mail: TbMailbox,       // Physical mailbox
  affiliate: HiLink,            // Partnership/links
  organic: HiGlobeAlt,          // Organic web traffic
  airbnb: SiAirbnb,             // Official Airbnb logo
  vrbo: HiHome,                 // House icon for Vrbo
  booking: HiBuildingOffice2,   // Hotel/building for Booking.com
  other: HiEllipsisHorizontalCircle, // Ellipsis for miscellaneous
}

export function ChannelAvatar({ channel, className }: ChannelAvatarProps) {
  const config = getChannelConfig(channel)
  const Icon = CHANNEL_ICONS[channel]

  // Fallbacks for unrecognized channels
  const color = config?.color ?? 'bg-gray-500'
  const name = config?.name ?? channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ')
  const abbreviation = config?.abbreviation ?? channel.slice(0, 2).toUpperCase()

  return (
    <div
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-white',
        color,
        className
      )}
      title={name}
      data-testid={`channel-avatar-${channel}`}
    >
      {Icon ? (
        <Icon className="w-4 h-4" />
      ) : (
        <span className="text-xs font-bold">{abbreviation}</span>
      )}
    </div>
  )
}
