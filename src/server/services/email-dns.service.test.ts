import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("internal verification is independent of public expiry and rotation preserves domain ownership", () => {
  // Module mocks live in a child process so other service tests retain their real imports.
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      fileURLToPath(
        new URL("../../../test/email-dns.fixture.ts", import.meta.url),
      ),
    ],
    { encoding: "utf8" },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "Email DNS ownership, expiry, rotation and lookup contracts passed",
  );
});
