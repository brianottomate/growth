/// <reference types="bun" />
import { mock } from "bun:test";

// Services initialize clients when imported, including tests of pure helpers.
// Fresh checkouts need no real database or provider credentials for this suite.
process.env.SKIP_ENV_VALIDATION = "1";
process.env.BETTER_AUTH_SECRET ??= "unit-test-only-recipient-secret";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/growth_test";
process.env.RESEND_API_KEY ??= "re_unit_test";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";

// `server-only` is a marker package: its default export throws on import so a
// Server-only module can't be pulled into a Client bundle. Next.js's RSC
// bundler resolves it to a no-op via the "react-server" export condition; bun
// test doesn't set that condition, so it hits the throwing default. Neutralize
// it here so server-tagged services are unit-testable directly (no .core split).
void mock.module("server-only", () => ({}));
