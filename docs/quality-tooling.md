# Quality tooling

`bun run check` generates Velite content and Next route types, runs typed Oxlint with TypeScript compiler diagnostics, checks formatting, and exercises the installed lint plugins. Generation makes the gate work in a fresh checkout.

Oxfmt reads `src/styles/globals.css` and sorts classes inside `cn`, `clsx`, `cva`, and `twMerge`. Generated Drizzle metadata stays formatter-owned by drizzle-kit.

The official `@shadcn/lint` plugin checks authenticated app UI and shared components. Unknown utility classes and component restyling fail the gate. Shared variants own compact controls, input states, media overlays, and component appearance. Containers permit layout and spacing; headings permit typography and icon gaps. Shared UI implementations and the social mock renderer own their internal styling. Raw colors remain advisory pending a separate palette review.

The initial 580 restyling findings are resolved through call-site migration and explicit component ownership contracts. Some compact controls and button gaps are standardized. Review the fictional campaign gallery at `/lab/design-contracts` in both themes and on desktop/mobile; it uses the existing teammate-only lab gate in deployments.

The official `eslint-plugin-drizzle` checks unscoped updates and deletes. Its undeclared runtime dependency, `@typescript-eslint/utils`, is installed explicitly. There is no local rule fork.

## Deployment type checking

`bun run build` runs `bun run typecheck` before the production schema push and Next compilation. That command generates Velite content and Next route types, then checks the application and generated route validator with native Oxlint TypeScript diagnostics. A type error stops the build before either later step.

Next's embedded TypeScript check is disabled because it exhausted the 8 GB Vercel build container after compilation on the oRPC branch. Running the existing native checker first keeps the type gate while letting its process exit before compilation starts. Use `bun run build` for deployment; invoking `next build` directly skips this gate.

## Editing loop

Install dependencies with `bun install` to enable Husky. Pre-commit runs Oxfmt on staged files through lint-staged, which preserves unstaged edits. Pre-push runs the full check without modifying source files.

Editor diagnostics run while typing. Automatic formatting and fixes on save are disabled. After a coherent edit, run `bun run format:write`, then reread the affected files before continuing to patch them. Finish with `bun run check`; `bun test` and `bun run ai:contracts` remain separate release gates.

A fresh checkout without app credentials can use `SKIP_ENV_VALIDATION=1 bun run check` for static validation. This does not validate production environment configuration.
