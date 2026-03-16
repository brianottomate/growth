import Image from 'next/image'
import { SettingsSection } from './SettingsSection'
import type { User } from '@/types'

interface ProfileSectionProps {
  user: User | null
}

export function ProfileSection({ user }: ProfileSectionProps) {
  if (!user) {
    return (
      <SettingsSection title="Profile">
        <div className="animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5" />
            <div className="space-y-2">
              <div className="h-5 w-32 bg-white/5 rounded" />
              <div className="h-4 w-48 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      </SettingsSection>
    )
  }

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown'

  return (
    <SettingsSection title="Profile">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.name || 'User avatar'}
            width={64}
            height={64}
            className="rounded-full object-cover"
            data-testid="profile-avatar"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full bg-accent-blue flex items-center justify-center"
            data-testid="profile-avatar-placeholder"
          >
            <span className="text-2xl font-bold text-white">
              {(user.name || user.email)?.[0]?.toUpperCase() || '?'}
            </span>
          </div>
        )}

        {/* Info */}
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {user.name || 'Wander User'}
          </h3>
          <p className="text-sm text-text-secondary">{user.email}</p>
          <p className="text-xs text-text-muted mt-1">
            Member since {memberSince}
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
