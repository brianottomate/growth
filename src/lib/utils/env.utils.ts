import { env } from "@/env";

/**
 * Environment-aware value selector
 * Selects values based on current environment (production vs test)
 * Matches production vs preview/development mode
 */
export function envSelect<T>(values: { prod: T; test: T }): T {
  return env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? values.prod
    : values.test;
}
