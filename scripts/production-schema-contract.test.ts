import { expect, test } from "bun:test";
import { assertSchemaPushSucceeded } from "./production-schema-contract";

test("a zero-exit database failure must stop the production release", () => {
  expect(() =>
    assertSchemaPushSucceeded({
      exitCode: 0,
      stdout: `[✓] Pulling schema from database...\nPostgresError: constraint "content_post_launch_id_launch_id_fk" of relation "content_post" does not exist\n  code: '42704'`,
      stderr: "",
    }),
  ).toThrow("refusing to build or deploy");
  expect(() =>
    assertSchemaPushSucceeded({
      exitCode: 0,
      stdout: "",
      stderr: "\u001b[31mError: Connection terminated\u001b[0m",
    }),
  ).toThrow();
});
test("normal schema completion and SQL error columns are accepted", () => {
  expect(() =>
    assertSchemaPushSucceeded({
      exitCode: 0,
      stdout: 'ALTER TABLE "job" ADD COLUMN "error" text;\n[✓] Changes applied',
      stderr: "",
    }),
  ).not.toThrow();
});
test("a nonzero schema process always blocks deployment", () => {
  expect(() =>
    assertSchemaPushSucceeded({ exitCode: 1, stdout: "", stderr: "" }),
  ).toThrow();
});
