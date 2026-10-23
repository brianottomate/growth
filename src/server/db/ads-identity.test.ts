import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("delivery identity prevents duplicate active sends while retaining removed history", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table platform_ad (ad_id text,platform_delivery_group_id text,status text); create table platform_campaign(campaign_id text,platform text);",
    );
    const migration = await readFile(
      new URL("../../../drizzle/0051_meta_plan_identity.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration.replaceAll("--> statement-breakpoint", ""));
    const archivedMigration = await readFile(
      new URL(
        "../../../drizzle/0052_archived_ad_delivery_history.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(archivedMigration.replaceAll("--> statement-breakpoint", ""));
    await db.exec(
      "insert into platform_ad values ('ad','set','deleted'),('ad','set','PAUSED');",
    );
    const duplicate = await db
      .exec("insert into platform_ad values ('ad','set','ACTIVE');")
      .catch((error) => error as Error);
    expect(duplicate).toBeInstanceOf(Error);
    expect((duplicate as Error).message).toContain(
      "platform_ad_plan_ad_set_idx",
    );
    await db.exec(
      "update platform_ad set status='DELETED'; insert into platform_ad values ('ad','set','PAUSED');",
    );
    const rows = await db.query<{ count: number }>(
      "select count(*)::int count from platform_ad",
    );
    expect(rows.rows[0]?.count).toBe(3);
    await db.exec(
      "update platform_ad set status='ARCHIVED'; insert into platform_ad values ('ad','set','PAUSED');",
    );
    await db.exec(
      "insert into platform_campaign values ('campaign','meta_ads');",
    );
    const repeatedPlan = await db
      .exec("insert into platform_campaign values ('campaign','meta_ads');")
      .catch((error) => error as Error);
    expect(repeatedPlan).toBeInstanceOf(Error);
    expect((repeatedPlan as Error).message).toContain(
      "platform_campaign_plan_platform_idx",
    );
  } finally {
    await db.close();
  }
}, 30_000);
