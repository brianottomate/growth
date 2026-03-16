# Hook Registry

| Hook | Path | Returns | Notes |
|------|------|---------|-------|
| `useAuth` | `@/hooks/use-auth` | `{ authUser, user, loading, signOut }` | Auth state and actions |
| `useDashboard` | `@/hooks/use-dashboard` | `{ data, isLoading, error, refetch }` | Dashboard data fetching |
| `useChannels` | `@/hooks/use-channels` | `{ channels, isLoading, error, refetch }` | Channel data fetching |
| `useInsights` | `@/hooks/use-insights` | `{ insights, isLoading, error, refetch }` | Insights data fetching |
| `useTrends` | `@/hooks/use-trends` | `{ trends, isLoading, error, refetch }` | Trend data fetching |
| `useToast` | `@/hooks/use-toast` | `{ success, error, info, dismiss }` | Toast methods |
| `useRefresh` | `@/hooks/use-refresh` | `{ isRefreshing, lastSync, lastUpdated, refresh }` | Refresh coordination |
| `useAskClaude` | `@/hooks/use-ask-claude` | `{ messages, isLoading, error, sendMessage, clearMessages }` | Chat management |
| `useAskClaudePanel` | `@/context/AskClaudeContext` | `{ isOpen, openPanel, closePanel, togglePanel }` | Panel state |
| `useSettings` | `@/hooks/use-settings` | `{ settings, isLoading, error, updateSettings }` | Settings management |
| `useTheme` | `@/providers/ThemeProvider` | `{ theme, resolvedTheme, setTheme }` | Theme management |

---

**How to Update:** After creating ANY hook, add it here.
