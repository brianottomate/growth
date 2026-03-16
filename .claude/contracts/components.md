# Component Registry

> NEVER create duplicate components. Check here first.

## UI Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `InsightBadge` | `@/components/ui/InsightBadge` | `severity`, `className?` | Severity label |
| `Toast` | `@/components/ui/Toast` | `toast`, `onDismiss` | Single toast |
| `ToastProvider` | `@/components/ui/ToastProvider` | `children` | Context wrapper |

## Dashboard Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `KPICard` | `@/components/dashboard/KPICard` | `label`, `value`, `change?`, `status?`, `size?` | Single KPI display |
| `KPIGrid` | `@/components/dashboard/KPIGrid` | `data`, `isLoading?` | Grid of all KPIs |
| `KPISkeleton` | `@/components/dashboard/KPISkeleton` | - | Loading state |
| `ChannelTable` | `@/components/dashboard/ChannelTable` | `channels`, `isLoading?` | Main table |
| `ChannelRow` | `@/components/dashboard/ChannelRow` | `metrics` | Single row |
| `ChannelAvatar` | `@/components/dashboard/ChannelAvatar` | `channel`, `className?` | Badge |
| `StatusDot` | `@/components/dashboard/StatusDot` | `cpb`, `className?` | Status indicator |
| `ChannelTableSkeleton` | `@/components/dashboard/ChannelTableSkeleton` | - | Loading state |
| `InsightsPanel` | `@/components/dashboard/InsightsPanel` | `insights`, `isLoading?` | Main container |
| `InsightCard` | `@/components/dashboard/InsightCard` | `insight`, `className?` | Single insight |
| `InsightsSkeleton` | `@/components/dashboard/InsightsSkeleton` | - | Loading state |
| `TrendsChart` | `@/components/dashboard/TrendsChart` | `data`, `isLoading?` | Recharts area chart |
| `TrendsChartSkeleton` | `@/components/dashboard/TrendsChartSkeleton` | - | Loading state |
| `ChartTooltip` | `@/components/dashboard/ChartTooltip` | `active?`, `payload?`, `label?` | Recharts tooltip |
| `RefreshButton` | `@/components/dashboard/RefreshButton` | `isRefreshing`, `onRefresh`, `className?` | Spinner button |
| `RefreshStatus` | `@/components/dashboard/RefreshStatus` | `lastUpdated`, `className?` | Relative time |

## Layout Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `Sidebar` | `@/components/layout/Sidebar` | `className?` | 64px icon-only sidebar |
| `SidebarIcon` | `@/components/layout/SidebarIcon` | `href?`, `icon`, `label`, `isActive?`, `onClick?` | Icon with tooltip |
| `Header` | `@/components/layout/Header` | `user` | Greeting + refresh button |
| `UserMenu` | `@/components/layout/UserMenu` | - | Avatar dropdown with sign out |
| `MobileNav` | `@/components/layout/MobileNav` | - | Mobile navigation drawer |

## Auth Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `AuthProvider` | `@/components/auth/AuthProvider` | `children`, `initialUser?` | Wrap app for auth context |
| `MagicLinkForm` | `@/components/auth/MagicLinkForm` | `redirectTo?`, `className?` | DORMANT — not used, replaced by PasswordLoginForm |
| `PasswordLoginForm` | `@/components/auth/PasswordLoginForm` | `redirectTo?`, `className?` | Email + password login with auto-signup |
| `SignOutButton` | `@/components/auth/SignOutButton` | `className?`, `showLabel?`, `variant?` | Sign out action |

## Ask Claude Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `AskClaudePanel` | `@/components/ask-claude/AskClaudePanel` | - | Slide-in panel |
| `ChatMessage` | `@/components/ask-claude/ChatMessage` | `message` | User or assistant |
| `ChatInput` | `@/components/ask-claude/ChatInput` | `onSend`, `isLoading`, `placeholder?` | Input + send button |
| `SuggestedPrompts` | `@/components/ask-claude/SuggestedPrompts` | `onSelect`, `disabled?` | Quick actions |
| `AskClaudeTrigger` | `@/components/ask-claude/AskClaudeTrigger` | `className?` | Sidebar trigger |

## Settings Components

| Component | Path | Props | Notes |
|-----------|------|-------|-------|
| `SettingsSection` | `@/components/settings/SettingsSection` | `title`, `children` | Section wrapper |
| `ProfileSection` | `@/components/settings/ProfileSection` | `user` | Profile display |
| `NotificationSettings` | `@/components/settings/NotificationSettings` | `settings`, `onUpdate`, `isLoading` | Email toggles |
| `DataSettings` | `@/components/settings/DataSettings` | `settings`, `onUpdate`, `isLoading` | Dashboard prefs |
| `Toggle` | `@/components/ui/Toggle` | `checked`, `onChange`, `label?`, `description?` | Toggle switch |
| `Select` | `@/components/ui/Select` | `value`, `onChange`, `options`, `label?` | Dropdown |
| `ThemeToggle` | `@/components/ui/ThemeToggle` | `className?` | Sun/Moon toggle |
| `AppearanceSettings` | `@/components/settings/AppearanceSettings` | - | Theme selector cards |

---

**How to Update:** After creating ANY component, add it here.
