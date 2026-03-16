# Quick Reference

## Two-Message Build Pattern

**Message 1:**
```
Build PROMPT_XX from `.claude/prompts/PROMPT_XX_[name].md`
Read contracts first. Update contracts after each file.
```

**Message 2:**
```
Run Implementation Checklist. Confirm contracts updated.
```

## Manual Steps (after each prompt)

```bash
npx playwright test tests/prompt-XX-*.spec.ts
npx tsc --noEmit
npm run dev
git add . && git commit -m "Prompt XX: [Feature]"
git push
```

## Context Recovery

```
Read `.claude/MASTER.md` and all files in `.claude/contracts/`
```

## Key Constants

- DCPB Target: $500
- ROAS: Take rate revenue / ad spend (not GMV)
- Allowed Domain: @wander.com
