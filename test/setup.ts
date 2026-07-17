import { mock } from "bun:test";

// `server-only` is a marker package: its default export throws on import so a
// Server-only module can't be pulled into a Client bundle. Next.js's RSC
// bundler resolves it to a no-op via the "react-server" export condition; bun
// test doesn't set that condition, so it hits the throwing default. Neutralize
// it here so server-tagged services are unit-testable directly (no .core split).
void mock.module("server-only", () => ({}));
