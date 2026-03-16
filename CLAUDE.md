# Project: Wander Growth Tracker

> This file configures Claude Code for this project. Read this first.
> **Files are the memory, not the conversation.**

---

## Project Overview

Internal marketing dashboard for Wander. Replaces spreadsheet-based reporting with real-time, glanceable interface. BigQuery is the single source of truth.

**Key constraints:**
- Only @wander.com employees (password auth, auto-signup on first login)
- WanderOS dark mode aesthetic
- DCPB target: $500 (Direct Cost Per Booking)
- ROAS uses take rate revenue, not GMV (per Dylan Wright review, March 2026)
- Fully Loaded CPB / Total CPB / CPAC use ALL marketing spend (ads + points + influencer + giveaways)
- mybookingpal = Amex (NOT Booking.com)
- Data source: `bookings_reconciled_v2` JOIN `funnel_events_attribution`, `is_profit=TRUE`, `status='confirmed'`
- Per-channel attribution: Platform APIs for channel performance, BigQuery for revenue reconciliation (Cam Aroz, March 2026). Meta = 28d click / 1d view, Google = data-driven, Pinterest = 30d click / 1d view (planned). All others = last-touch from BigQuery. See `.claude/contracts/data-source-hierarchy.md`.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Password (auto-signup) |
| Charts | Recharts |
| State | Zustand + React Query |
| AI | Anthropic Claude API |
| Data Source | BigQuery |
| Hosting | Railway |

---

## References

Before building any feature, read:
- `/references/01-UX-Reference-Guide.md` — What users see and do
- `/references/02-Product-Spec.md` — Technical architecture
- `/references/03-Design-System.md` — Visual constraints

---

## Contracts System

This project uses the Zero Bug Build System.

**Before writing ANY code:**
1. Read the prompt file
2. Read ALL contracts in `.claude/contracts/`
3. Check dependencies in `.claude/state/completed-prompts.md`

**After creating ANY file:**
1. Update `imports.md` with new exports
2. Update `types.md` with new types
3. Update relevant contracts

---

## Bug Prevention Rules

### Next.js 15
- `params` and `searchParams` are Promises — ALWAYS await them
- Page components using params/searchParams must be async
- Use `await cookies()` and `await headers()`

### TypeScript
- All types defined in `@/types/index.ts` — NEVER redefine
- Use `SupabaseClient<any, any, any>` for client parameters
- No `any` types except Supabase client params

### Supabase
- Pass client as parameter, don't create inside functions
- Use service client for RLS bypass operations
- Every table with `updated_at` needs a trigger

### Data Handling
- Missing data displays as "—" (em dash), never $0 or blank
- Use `safeDiv()` for all division operations
- Null-safe all optional chaining

---

## Context Recovery

If context compacts, say:
> Read `.claude/MASTER.md` and all files in `.claude/contracts/`

---

## Commands

```bash
npm run dev              # Development server
npm run build            # Production build
npx tsc --noEmit         # Type check
npm run test             # Unit tests (Vitest)
npm run test:e2e         # E2E tests (Playwright)
```
