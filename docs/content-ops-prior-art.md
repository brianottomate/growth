# Content Ops — Prior Art Feature Inventory

Two Brian-built tools live in `~/Developer/wander/brian/` and overlap in scope. This doc inventories what each one does so we can pick what to carry into a proper rebuild without re-reading 5,000 lines of HTML.

- `brian/content-calendar/` — Supabase-backed single-page calendar. Live, in active use, schema-evolving through May 2026.
- `brian/wander-social-dashboard/` — localStorage-only social ops dashboard. Single-user, rich UI, no real backend.

Both are no-build static HTML. Both should be replaced by one Next.js app on the Wander stack (Vercel + Neon + R2 + Doppler, per `MEMORY.md` infrastructure decisions).

---

## A. `content-calendar` (Supabase-backed)

### Data model
- **One entity**: calendar item.
- **Fields**: `id` (UUID), `date`, `title`, `tag` (3-way brand), `type` (7-way content type), `status` (5-state workflow), `owner` (free-text), `note`, `created_at`, `updated_at`.

### Views
- **Month calendar grid** only. Sticky day-of-week headers, "today" cell highlight, out-of-month days greyed.

### Core item operations
- Click empty day → **add modal** prefilled with that date.
- Click item → **edit modal**.
- **Delete** from edit modal.
- **Drag-and-drop** item to another date (instant save, toast).

### Editing modal fields
- Title (required, red border on blank).
- Type — 7-way pill toggle with colored swatches: Emails, Filming, Videos, Launches, Social, Push.
- Channel — 3-way pill toggle: Wander.com, WanderOS, John Andrew.
- Owner — free-text input + click-to-toggle pills of existing owners (with case normalization on save).
- Status — `<select>`: Planned / Draft / In Review / Approved / Sent.
- Note — textarea.

### Filtering / segmentation
- **Brand filter bar** (header): All / Wander.com / WanderOS / John Andrew.
- **Type legend bar**: All / Emails / Filming / Videos / Launches / Social / Push.
- **Owner filter bar**: dynamically built from existing owners + "Unassigned" pseudo-filter + "All owners".

### KPIs (top strip)
- This Week count.
- This Month count.
- Per-brand monthly counts (Wander / WanderOS / JA).

### Chrome / global
- Month nav (prev / next / month label).
- Light/dark theme toggle (logo swaps black ↔ white).
- Loading bar (top of page during Supabase round-trips).
- Toast (Added / Updated / Deleted / Moved).

### Notable gaps
- No list/board/week views, no kanban.
- No search, no bulk select, no undo.
- No URL state, no auth (open anon CRUD), no realtime, no comments, no attachments.
- Type/tag enums are Postgres CHECK constraints — adding a new value requires a migration AND code changes in 5+ places.
- `migration-add-owner.sql` sits outside `supabase/migrations/` — schema is non-reproducible.
- The `headshots` storage bucket belongs to an unrelated email-signatures tool. Don't port.

---

## B. `wander-social-dashboard` (localStorage)

Much larger surface. ~1,800 lines, 7 pages, 2 modals. Richer per-post data model.

### Data model
**Posts** — `id`, `year`, `month`, `day`, `platform`, `pillar`, `series`, `title`, `hook`, `caption`, `cta`, `manychat` (keyword), `kpi` (free-text target), `status`, `rawLink`, `finalLink`, `notes`.

**KPI history** — `{week:'2026-W23', date:'Jun 2, 2026', values:{ig_reach, ig_eng, ...}}` keyed in localStorage as `wander_kpi_v1`.

**Static dictionaries** — hardcoded constants:
- `MC_DEF` — ManyChat keywords with delivers / goal / posts / triggers / conv. rate / status.
- `SERIES_DEF` — series with pillar, posts, avg save rate, status.

### Pages (left sidebar)
1. **Overview** — the dashboard home.
2. **Calendar** (month + week views).
3. **All Posts** (table + kanban view).
4. **Pipeline** (kanban by status).
5. **KPI Tracker** (per-platform metrics with history).
6. **ManyChat** tracker.
7. **Series Library**.

Sidebar also has **Platform shortcuts** (IG / TikTok / Pinterest / YouTube Shorts) and **Pillar shortcuts** (5 pillars) that deep-link All Posts with pre-applied filters.

### Overview page
- Greeting strip (time-of-day greeting + full date).
- **Today strip**: current month progress, "% of N posts complete · M need attention," status counts, ManyChat trigger count.
- **Row 1**: Production status card (status counts + progress bar) · KPI snapshot (6 mini-bars with target%) · Upcoming-14-days list.
- **Row 2**: Content mix by pillar (bars) · Platform breakdown (bars) · Alerts & actions (auto-generated) · ManyChat top-keywords mini-bars.
- **Row 3**: 3 quick-link cards to Calendar / All Posts / Pipeline.

### Calendar page
- **Month** and **Week** view toggle.
- **Today** button + prev / next nav.
- Filters: platform, pillar, status (3 selects).
- Legend bar: pillar dots + status dots.
- Day cells: pillar-colored event chips with platform 2-letter prefix.
- **"+N more"** overflow → day-detail panel listing all posts.
- Click event → opens detail panel.

### All Posts page
- **Stats row** (status counts) computed from filtered set.
- Filters: platform, pillar, status, year (dynamic from data), month.
- **View toggle**: Table / Board.
- **Table columns**: Name, Date, Platform, Pillar, Series, Status (inline select), Raw file (link/Add), Final file (link/Add), ManyChat, KPI.
- Inline status changes from the table (no modal).
- Inline "Add raw/final link" via mini-prompt.

### Pipeline page
- 4-stage kanban: Planned → In review → Approved → Posted.
- Cards: title, platform tag, date, "no raw" warning chip, notes preview.
- Stage counts in column headers.
- **In-review badge dot** on sidebar nav item (live count).

### KPI Tracker page
- **5 KPI groups** with metric schemas:
  - **Instagram** (5 metrics): reach rate, engagement rate, save rate, story view rate, share rate.
  - **TikTok** (4): completion, comment, profile visit, returning viewers.
  - **Pinterest** (2): monthly impressions, outbound click rate.
  - **ManyChat** (3): triggers, conversion rate, subscriber retention.
  - **Conversion** (2): link-in-bio CTR, social-assisted sessions.
- Each metric carries: id, label, unit, target, target label, hint text, **"where to find it" path** (e.g. "Instagram → Professional Dashboard → Insights → Overview").
- **KPI cards** show: current value, target, **progress bar (red/amber/green by % of target)**, trend arrow + delta vs previous week, "was X" prev value, "no prior data" badge if first entry.
- **Weekly update modal**: per-week (ISO week) form with hint text per field; saves to history.
- **History modal**: collapsible list of past weekly updates, delete-entry per row.
- **Weekly trends sparklines** (SVG polyline) for 5 key metrics across all history.

### ManyChat page
- Static table: keyword, delivers, goal, posts using it, triggers count, conversion rate, status (Active / Pending).

### Series Library page
- Static table: name, pillar, total posts, avg save rate, status (Active / Upcoming / Planned).

### Post detail panel (used everywhere)
Slide-in side panel with **on-blur autosave** on each field:
- Series, Status, Hook, Caption, CTA, ManyChat keyword, KPI target, Raw file link (+ Open), Final file link (+ Open), Notes.
- "Done" + "Delete" buttons.

### Global topbar
- Breadcrumb (Wander / current page).
- Live **search** across post fields.
- **Clear filters** button.
- **Import Excel** button.
- **Sync posts** button (re-merges new SEED additions while preserving user-added posts).
- **New post** (creates skeleton + opens detail).

### Excel import wizard (3-step modal)
- **Step 1** — drop zone or click-to-browse (.xlsx/.xls/.csv); template download; "expected column names" chip list.
- **Step 2** — column mapping grid with auto-detection by 14 field-alias arrays (e.g. `title`/`content`/`concept`/`post`); matched columns highlighted green.
- **Step 3** — preview table with row-level "New" / "Replace" / "Skip" badges; **dedup checkbox** ("Replace existing posts with same date + platform"); commit with new/updated count toast.
- Excel date parsing (serial codes + multiple natural-language patterns); platform/pillar/status normalization.
- Template download: `XLSX.writeFile('Wander_Content_Calendar_Template.xlsx')` with pre-styled column widths.

### Static taxonomies (would become reference data)
- **Platforms**: Instagram, TikTok, Pinterest, YouTube Shorts.
- **Pillars**: Timely Travel, Travel Discovery, Brand & Trust, Entertainment, Insider Community (each with brand color + light tint background).
- **Statuses**: Planned, In review, Approved, Posted (each with bg/fg colors).
- **KPI schema** as defined above.
- **ManyChat keyword library** (7 keywords).
- **Series library** (13 series).

---

## C. Unified feature list for the rebuild

Crossed-out below = drop; **★** = upgrade target (new in rebuild).

### Core data
- **Posts/items** with shared base fields (title, date, status, owner, notes) plus social-specific fields (platform, pillar, series, hook, caption, CTA, ManyChat keyword, KPI target, raw/final asset links).
- **Brand/channel tag** on every item (Wander.com, WanderOS, John Andrew).
- **Type/category** (Emails, Filming, Videos, Launches, Social, Push) — content-calendar's notion.
- **Pillars + Series + Platforms** as first-class reference tables, not hardcoded constants. ★
- **Weekly KPI history** with per-platform metric definitions + targets + "where to find" hint.
- **ManyChat keyword library** and **Series library** as reference data (with optional rollup metrics).
- Owner as a real FK to a `users` table, not free-text. ★

### Views
- Month calendar (drag-and-drop reschedule).
- Week calendar.
- List/table (with column-specific cell editors).
- Kanban / pipeline by status.
- Overview dashboard (status snapshot, KPI snapshot, upcoming, content mix, platform breakdown, alerts).
- KPI tracker (cards + sparkline trends + history + per-metric "where to find").
- ManyChat tracker.
- Series library.

### Item editor
- Side panel preferred over modal (autosave on blur per field).
- All fields editable.
- Inline status changes from list and calendar.
- Inline asset-link add.
- Delete with confirm.

### Filtering & search
- Free-text search across post fields.
- Per-view filter bars: brand, type, platform, pillar, status, owner, year, month.
- "Clear filters" affordance.
- Sidebar shortcuts that pre-apply filters (platform / pillar deep-links).
- All filter+view state encoded in the URL. ★

### KPIs and analytics
- Top-strip KPIs (this week / this month / per-brand).
- Production status card with progress bar.
- Per-pillar mix bars.
- Per-platform bars.
- Per-metric trend cards with sparkline + arrow + delta + previous value.
- Auto-generated alerts (in-review backlog, missing raw assets, KPI vs target).
- Quick-link nav cards.

### Import / sync / templates
- Excel/CSV import wizard with column auto-mapping, preview, replace-vs-add dedup.
- Excel template download (pre-styled).
- Drop the "Sync posts" / SEED merge concept — irrelevant once data lives in a real DB. ✂

### Chrome
- Light/dark theme toggle with persisted preference.
- Toast notifications.
- Loading indicator.
- Sidebar nav with section dividers (Pages / Platforms / Pillars).
- Breadcrumb in topbar.
- Badge dot on Pipeline nav for in-review count.

### Multi-user / collab (new in rebuild) ★
- Auth (Google SSO via Wander; replaces "your data lives in your browser").
- Realtime updates (Neon logical replication + Inngest, or polling+SWR for v1).
- Per-item activity log.
- Comments on items.
- @-mentions of owners.
- Permissions (read vs edit; KPI editor restricted to social team).

### Cut / consolidate ✂
- 3 prototype HTML files in `content-calendar/` → all replaced by the rebuild.
- 3 `index*.html` variants in `wander-social-dashboard/` → consolidate.
- Hardcoded SEED data → seed migration once, then drop.
- `headshots` Supabase storage policy in content-calendar → belongs to a separate email-signatures tool, don't port.
- "Your file never leaves your browser" / "Data saves to your browser" messaging → replaced by proper persistence.

---

## Suggested next steps

1. Sketch a concrete schema (tables + relationships + enums) mapping these features into Neon + Drizzle.
2. Decide where the rebuild lives — most likely a new page in `growth/` (Jetpack), given growth team owns marketing ops and the existing stack matches.
3. One-shot dump of the live `calendar_items` Supabase table → seed migration into Neon.
4. Reuse the Wander design-token block at the top of `content-calendar/index.html` — it's brand language distilled into CSS variables, would map cleanly onto `design-system/`.
