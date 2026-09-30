import { expect, test } from "bun:test";

// Isolate provider and Next.js mocks from the rest of the service test suite.
test("Performance intake notifications preserve submission and delivery behavior", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "./test/fixtures/performance-intake-notification.ts",
    ],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ exitCode, output: exitCode === 0 ? "" : stdout + stderr }).toEqual({
    exitCode: 0,
    output: "",
  });
}, 60_000);
