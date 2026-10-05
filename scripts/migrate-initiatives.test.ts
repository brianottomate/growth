import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { migrateInitiatives } from "./migrate-initiatives";
import {
  initiativeIncludesPost,
  initiativeTargetSchema,
} from "../src/lib/initiative";
const database = new PGlite();
const migration = () =>
  database.transaction(async (tx) =>
    migrateInitiatives({ unsafe: async (sql) => (await tx.query(sql)).rows }),
  );
beforeAll(async () => {
  await database.exec(`CREATE TABLE organization (id text PRIMARY KEY);
 CREATE TABLE "user" (id text PRIMARY KEY);
 CREATE TABLE brand (id text PRIMARY KEY, organization_id text REFERENCES organization(id));
 CREATE TABLE campaign (id text PRIMARY KEY, brand_id text REFERENCES brand(id), name text, description text, status text, start_at timestamptz, end_at timestamptz);
 CREATE TABLE series (id text PRIMARY KEY, brand_id text REFERENCES brand(id), campaign_id text REFERENCES campaign(id));
 CREATE TABLE content_post (id text PRIMARY KEY, brand_id text REFERENCES brand(id), series_id text REFERENCES series(id), campaign_id text REFERENCES campaign(id));
 INSERT INTO organization VALUES ('org'), ('other');
 INSERT INTO brand VALUES ('brand', 'org'), ('otherbrand', 'other');
 INSERT INTO campaign VALUES ('paid', 'brand', 'Push', 'Brief', 'planned', NULL, NULL);
 INSERT INTO series VALUES ('series', 'brand', 'paid');
 INSERT INTO content_post VALUES ('post', 'brand', 'series', 'paid'), ('standalone', 'brand', NULL, NULL), ('crossworkspace', 'otherbrand', NULL, 'paid');`);
  await migration();
});
afterAll(() => database.close());
describe("Initiative cutover and membership integrity", () => {
  test("preserves authored work and existing groupings, excludes cross-workspace legacy links", async () => {
    const { rows } = await database.query<{
      content_post_id: string | null;
      series_id: string | null;
      campaign_id: string | null;
    }>("SELECT * FROM initiative_member ORDER BY id");
    expect(rows).toHaveLength(3);
    expect(rows.some((m) => m.content_post_id === "post")).toBe(true);
    expect(rows.some((m) => m.series_id === "series")).toBe(true);
    expect(rows.some((m) => m.campaign_id === "paid")).toBe(true);
    expect(rows.some((m) => m.content_post_id === "crossworkspace")).toBe(
      false,
    );
    expect(
      (await database.query("SELECT * FROM content_post")).rows,
    ).toHaveLength(3);
    const columns = await database.query(
      "SELECT * FROM information_schema.columns WHERE table_name IN ('series', 'content_post') AND column_name = 'campaign_id'",
    );
    expect(columns.rows).toHaveLength(0);
  });
  test("repeat deploys preserve memberships and initiatives without duplicates", async () => {
    await migration();
    expect(
      (await database.query("SELECT * FROM initiative")).rows,
    ).toHaveLength(1);
    expect(
      (await database.query("SELECT * FROM initiative_member")).rows,
    ).toHaveLength(3);
  });
  test("database rejects missing, ambiguous, dangling, and duplicate memberships", async () => {
    const invalid = [
      "INSERT INTO initiative_member VALUES ('empty', 'init_paid', NULL, NULL, NULL, now())",
      "INSERT INTO initiative_member VALUES ('ambiguous', 'init_paid', 'post', 'series', NULL, now())",
      "INSERT INTO initiative_member VALUES ('dangling', 'init_paid', 'missing', NULL, NULL, now())",
      "INSERT INTO initiative_member VALUES ('duplicate', 'init_paid', 'post', NULL, NULL, now())",
    ];
    for (const query of invalid) {
      let rejected = false;
      try {
        await database.query(query);
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
    }
  });
  test("one item can belong to multiple initiatives; deleting a link preserves work", async () => {
    await database.exec(
      "INSERT INTO initiative (id, organization_id, name, created_at, updated_at) VALUES ('second', 'org', 'Another push', now(), now()); INSERT INTO initiative_member VALUES ('second_post', 'second', 'post', NULL, NULL, now()); DELETE FROM initiative WHERE id = 'second'",
    );
    expect(
      (await database.query("SELECT * FROM content_post WHERE id = 'post'"))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await database.query(
          "SELECT * FROM initiative_member WHERE id = 'second_post'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  test("direct and series memberships deduplicate; standalone posts remain supported", () => {
    const members = [
      { contentPostId: "post", seriesId: null },
      { contentPostId: null, seriesId: "series" },
    ];
    const posts = [
      { id: "post", seriesId: "series" },
      { id: "future", seriesId: "series" },
      { id: "standalone", seriesId: null },
    ];
    expect(
      posts.filter((p) => initiativeIncludesPost(p, members)).map((p) => p.id),
    ).toEqual(["post", "future"]);
    expect(
      initiativeIncludesPost(posts[2]!, [
        { contentPostId: "standalone", seriesId: null },
      ]),
    ).toBe(true);
    expect(initiativeTargetSchema.safeParse({}).success).toBe(false);
    expect(
      initiativeTargetSchema.safeParse({
        seriesId: "series",
        contentPostId: "post",
      }).success,
    ).toBe(false);
  });
  test("a failed cutover rolls back both the data and destructive column changes", async () => {
    let failure: unknown;
    try {
      await database.transaction(async (tx) => {
        await tx.exec(
          "ALTER TABLE content_post ADD COLUMN campaign_id text; UPDATE content_post SET campaign_id = 'paid'",
        );
        await migrateInitiatives({
          unsafe: async (sql) => (await tx.query(sql)).rows,
        });
        throw new Error("Abort deployment migration");
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Abort deployment migration");
    expect(
      (await database.query("SELECT * FROM initiative_member")).rows,
    ).toHaveLength(3);
  });
});
