import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// These tests earn their budget at a new public-sharing boundary: a missing
// tenant WHERE, stale write, or revoked-token regression exposes private data.
// The child owns all module mocks; none can contaminate the full Bun suite.
test("home group share SQL privacy and authorization contract", async () => {
  const child = Bun.spawn(
    [process.execPath, "test/fixtures/home-group-shares.acceptance.ts"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      // Do not inherit a developer's provider/production credentials.
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        SKIP_ENV_VALIDATION: "1",
        DATABASE_URL: "postgresql://test:test@127.0.0.1:1/never_connect",
        RESEND_API_KEY: "re_unit_test",
        NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const timer = setTimeout(() => child.kill(), 110_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, stderr, stdout }).toEqual({
      code: 0,
      stderr: "",
      stdout: "home group share acceptance: 8 scenarios passed\n",
    });
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}, 120_000);
