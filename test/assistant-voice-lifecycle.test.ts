import { expect, test } from "bun:test";

for (const [scenario, outcome] of [
  ["unmount", "switching chats without starting voice does not crash"],
  [
    "final-captions",
    "ending voice includes late transcript fragments in the recovered draft and retained transcript",
  ],
  [
    "provider-close",
    "provider closure recovers unsent speech, stops result reads, and allows a new call",
  ],
] as const) {
  test(outcome, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "test/fixtures/assistant-voice-lifecycle.tsx",
        scenario,
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, error }).toEqual({ code: 0, error: "" });
    expect(output).toContain("voice lifecycle checks passed");
  });
}
