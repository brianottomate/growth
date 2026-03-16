# Wander Growth Tracker — Build System

## Read Before Every Build Task

### Before Writing ANY Code

1. Read the prompt file: `.claude/prompts/PROMPT_XX_*.md`
2. Read ALL contracts in `.claude/contracts/`
3. Check dependencies in `.claude/state/completed-prompts.md`

### During Every Build Task

- Check imports.md before importing anything
- Check types.md before creating/using types
- Check components.md before creating/using components
- Update contracts IMMEDIATELY after creating new exports
- NEVER guess at import paths
- NEVER create duplicate types

### After Every Build Task

1. Run Implementation Checklist (in prompt file)
2. Update ALL affected contracts
3. Run Playwright test
4. Mark complete in `.claude/state/completed-prompts.md`
5. Git commit

### If Context Compacts

Say: "Read `.claude/MASTER.md` and all files in `.claude/contracts/`"

---

## Contract Quick Reference

| Need to... | Check |
|------------|-------|
| Import something | imports.md |
| Use/create a type | types.md |
| Use/create a component | components.md |
| Call an API | api-routes.md |
| Query database | database.md |
| Use a hook | hooks.md |
| Prevent known bugs | CLAUDE.md (Bug Prevention Rules) |
| Debug complex issue | troubleshooting.md |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Google OAuth |
| Charts | Recharts |
| State | Zustand + React Query |
| AI | Anthropic Claude API |
| Data Source | BigQuery |
| Hosting | Railway |
