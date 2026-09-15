import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Exercise the installed plugins through the real CLI so missing dependencies
// and accidentally disabled policies fail the same gate as application code.
test("quality gate recognizes theme classes and unsafe database mutations", () => {
  const dir = mkdtempSync("src/components/quality-fixture-");
  const path = join(dir, "fixture.tsx");
  const lint = (source) => {
    writeFileSync(path, source);
    const result = spawnSync(
      "bunx",
      ["--no-install", "oxlint", "--format", "json", path],
      { encoding: "utf8" },
    );
    return JSON.parse(result.stdout).diagnostics;
  };
  try {
    const valid = lint(
      'export const Sample = () => <div className="bg-card text-muted-foreground" />;',
    );
    assert.equal(
      valid.some((d) => d.code.includes("no-unknown-classes")),
      false,
    );
    const invalid = lint(
      'export const Sample = () => <div className="paddding-4" />;',
    );
    assert.ok(
      invalid.some(
        (d) => d.code.includes("no-unknown-classes") && d.severity === "error",
      ),
    );
    const restyled = lint(
      'import { Button } from "@/components/ui/button"; export const Sample = () => <Button className="px-12">Action</Button>;',
    );
    assert.ok(
      restyled.some(
        (d) => d.code.includes("no-restyle") && d.severity === "error",
      ),
    );
    const variant = lint(
      'import { Button } from "@/components/ui/button"; export const Sample = () => <Button density="editorial" shape="round">Action</Button>;',
    );
    assert.equal(
      variant.some((d) => d.code.includes("no-restyle")),
      false,
    );
    const unsafe = lint(
      "declare const db: any; declare const table: any; db.delete(table); db.update(table).set({});",
    );
    assert.ok(unsafe.some((d) => d.code.includes("enforce-delete-with-where")));
    assert.ok(unsafe.some((d) => d.code.includes("enforce-update-with-where")));
    const safe = lint(
      "declare const db: any; declare const table: any; db.delete(table).where(true); db.update(table).set({}).where(true);",
    );
    assert.equal(
      safe.some((d) => d.code.includes("drizzle")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
