import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("Performance lead delivery keeps CRM ownership, retries and test events safe", async () => {
  const child = Bun.spawn(
    [process.execPath, "test/fixtures/performance-meta-leads.ts"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        SKIP_ENV_VALIDATION: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({
    code,
    stderr,
    passed: stdout.includes("Performance lead acceptance passed"),
  }).toEqual({ code: 0, stderr: "", passed: true });
}, 30000);
