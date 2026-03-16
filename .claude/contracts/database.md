# Database Registry

> Single source of truth for all tables. Matches Supabase schema.

## Functions

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Trigger function for auto-updating updated_at |
| `is_wander_email()` | Check if auth user is @wander.com |

## Tables

### `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen | |
| `email` | varchar(255) | NOT NULL, UNIQUE, CHECK @wander.com | |
| `name` | varchar(255) | nullable | Display name |
| `avatar_url` | text | nullable | Profile photo |
| `last_login` | timestamptz | nullable | |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | Auto-updated |

**RLS Policies:**
- `users_select_own`: SELECT WHERE auth.uid() = id AND is_wander_email()
- `users_insert_own`: INSERT WITH CHECK auth.uid() = id AND is_wander_email()
- `users_update_own`: UPDATE WHERE auth.uid() = id AND is_wander_email()

**Indexes:**
- `idx_users_email` on email

---

### `sync_logs`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen | |
| `started_at` | timestamptz | NOT NULL, default now() | |
| `completed_at` | timestamptz | nullable | |
| `status` | varchar(20) | NOT NULL, default 'running' | running/success/partial_failure/failed |
| `trigger` | varchar(20) | NOT NULL | scheduled/manual/api |
| `results` | jsonb | default '{}' | Query results |
| `duration_ms` | integer | nullable | |
| `error` | text | nullable | |
| `created_at` | timestamptz | NOT NULL, default now() | |

**RLS Policies:**
- `sync_logs_select_all`: SELECT WHERE is_wander_email() (all authenticated users can read)
- Insert/Update: Service role only

**Indexes:**
- `idx_sync_logs_started_at` on started_at DESC
- `idx_sync_logs_status` on status

---

### `channel_snapshots`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen | |
| `channel` | varchar(50) | NOT NULL | Channel identifier |
| `date` | date | NOT NULL | Metrics date |
| `spend` | decimal(12,2) | nullable | |
| `account_creations` | integer | nullable | |
| `checkout_previewed` | integer | nullable | |
| `checkout_started` | integer | nullable | |
| `bookings` | integer | nullable | |
| `gmv` | decimal(12,2) | nullable | |
| `clicks` | integer | nullable | Click count |
| `impressions` | integer | nullable | Impression count |
| `attribution` | varchar(50) | nullable | first_partner/view_click/data_driven/last_click |
| `data_source` | varchar(50) | NOT NULL | bigquery/fixed_cost/manual |
| `synced_at` | timestamptz | NOT NULL, default now() | |
| `created_at` | timestamptz | NOT NULL, default now() | |

**RLS Policies:**
- `snapshots_select_all`: SELECT WHERE is_wander_email()
- Insert/Update/Delete: Service role only

**Indexes:**
- `idx_snapshots_channel_date` on (channel, date)
- `idx_snapshots_date` on date DESC
- `idx_snapshots_synced_at` on synced_at DESC

**Unique Constraint:**
- (channel, date)

---

### `ask_claude_conversations`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen | |
| `user_id` | uuid | FK users(id), NOT NULL | |
| `messages` | jsonb | NOT NULL, default '[]' | AskClaudeMessage[] |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | Auto-updated |

**RLS Policies:**
- `ask_claude_select_own`: SELECT WHERE auth.uid() = user_id AND is_wander_email()
- `ask_claude_insert_own`: INSERT WITH CHECK auth.uid() = user_id AND is_wander_email()
- `ask_claude_update_own`: UPDATE WHERE auth.uid() = user_id AND is_wander_email()
- `ask_claude_delete_own`: DELETE WHERE auth.uid() = user_id AND is_wander_email()

**Indexes:**
- `idx_ask_claude_user` on user_id
- `idx_ask_claude_updated` on updated_at DESC

---

### `user_settings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen | |
| `user_id` | uuid | FK → users(id), UNIQUE | Cascade delete |
| `email_insights_digest` | boolean | default true | |
| `email_cpb_alert` | boolean | default false | |
| `default_date_range` | varchar(10) | default '30' | 7/14/30/60/90 |
| `auto_refresh_interval` | varchar(10) | default '60' | 15/30/60/240/never |
| `created_at` | timestamptz | default now() | |
| `updated_at` | timestamptz | default now() | Auto-updated |

**RLS Policies:**
- `user_settings_select`: SELECT WHERE auth.uid() = user_id
- `user_settings_insert`: INSERT WHERE auth.uid() = user_id
- `user_settings_update`: UPDATE WHERE auth.uid() = user_id

**Indexes:**
- `idx_user_settings_user_id` on user_id
