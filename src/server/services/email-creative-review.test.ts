import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { TransactionClient } from "@/server/db";
import {
  assertEmailCreativeEditable,
  nextEmailReviewStatus,
} from "./email-creative-review";

test("approved email documents remain locked through scheduling and sending, while ready drafts stay editable", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE platform_post (id text PRIMARY KEY, platform text, status text);
      CREATE TABLE platform_document (platform_post_id text, document_id text);
      INSERT INTO platform_post VALUES ('email', 'newsletter', 'pending_review');
      INSERT INTO platform_document VALUES ('email', 'document');`);
    const tx = drizzle(pg, {
      casing: "snake_case",
    }) as unknown as TransactionClient;
    await assertEmailCreativeEditable(tx, "document");
    for (const status of ["approved", "scheduled", "published"]) {
      await pg.query("UPDATE platform_post SET status=$1 WHERE id='email'", [
        status,
      ]);
      expect(assertEmailCreativeEditable(tx, "document")).rejects.toThrow(
        "Reopen",
      );
    }
    await pg.exec("UPDATE platform_post SET status='draft' WHERE id='email'");
    await assertEmailCreativeEditable(tx, "document");
    await pg.exec(
      "UPDATE platform_post SET platform='blog', status='approved' WHERE id='email'",
    );
    await assertEmailCreativeEditable(tx, "document");
  } finally {
    await pg.close();
  }
}, 30000);

test("review refuses stale approval clicks and reopening sent emails", () => {
  expect(() => nextEmailReviewStatus("draft", "approve")).toThrow();
  expect(() => nextEmailReviewStatus("approved", "ready")).toThrow();
  expect(() => nextEmailReviewStatus("published", "reopen")).toThrow();
  expect(nextEmailReviewStatus("approved", "reopen")).toBe("draft");
});
