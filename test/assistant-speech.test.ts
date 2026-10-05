import { expect, test } from "bun:test";
test("voice admission preserves access, quota, server configuration, and private provider errors", async () => {
  const child = Bun.spawn(
    [process.execPath, "test/fixtures/assistant-speech-boundary.ts"],
    {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({
    code,
    error,
  }).toEqual({
    code: 0,
    error: "",
  });
  expect(output).toContain("speech boundary checks passed");
});
