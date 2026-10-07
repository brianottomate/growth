import { expect, test } from "bun:test";

test("clicking one copy set sends its caption and nested image edit together, without applying on render", async () => {
  const child = Bun.spawn(
    [process.execPath, "test/fixtures/copy-suggestion-selection.tsx"],
    { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ code, error }).toEqual({ code: 0, error: "" });
  expect(output).toContain("copy selection checks passed");
});
