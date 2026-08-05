import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
// @ts-ignore -- no flat-config types for this plugin
import reactHooks from "eslint-plugin-react-hooks";
// @ts-ignore -- no types for this plugin
import drizzle from "eslint-plugin-drizzle";

export default defineConfig(
  // Global ignores. `scripts/amplitude-taxonomy/**` is gitignored (holds API +
  // secret keys) and isn't part of the repo, so don't lint it.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".velite/**",
      "scripts/amplitude-taxonomy/**",
      // `agents/**` are standalone sub-projects with their own package.json,
      // dependencies and tsconfig (see agents/gdpr-scan). They are not part of
      // the Next.js app and their imports (e.g. `eve`) don't resolve from the
      // root install, so linting them here only produces phantom errors.
      "agents/**",
      // Nested git worktrees are a whole second checkout of this repo. Linting
      // them doubles the work and reports the same phantom errors as `agents/**`
      // above, because those paths fall outside the root tsconfig's include so
      // typed rules cannot resolve anything. `bun run check` fails the moment a
      // worktree exists, which is exactly when you least want a red gate.
      ".worktrees/**",
    ],
  },
  // Base config for all JS/TS files
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      // The plugin's own type isn't assignable to ESLint's Plugin type even on
      // latest (7.1.1) — registering a rule *subset* requires this cast. The
      // only cast-free path is consuming the whole `configs.flat.recommended`
      // preset, which would force on v7's full React-Compiler ruleset.
      "react-hooks": /** @type {import("eslint").ESLint.Plugin} */ (reactHooks),
    },
    rules: {
      // Next.js rules
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      // React Hooks rules (plugin was installed but never registered)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // TypeScript-specific config
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      drizzle,
    },
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "drizzle/enforce-delete-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
    },
  },
  // Global linter options
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  // Prettier must be last to override conflicting formatting rules
  eslintConfigPrettier,
);
