import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { campaignAudienceStatements } from "./migrate-campaign-audiences";

test("cutover preserves explicit targeting, shares persona assets, and replay does not undo an unlink", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TYPE channel_platform AS ENUM ('meta_ads','google_ads');
      CREATE TABLE persona(id text PRIMARY KEY);
      CREATE TABLE audience(id text PRIMARY KEY, brand_id text, persona_id text);
      CREATE TABLE channel(id text PRIMARY KEY, platform channel_platform);
      CREATE TABLE platform_audience(id text PRIMARY KEY, audience_id text, persona_id text, brand_id text, external_id text, channel_id text, updated_at timestamp);
      INSERT INTO persona VALUES ('p');
      INSERT INTO audience VALUES ('a1','b','p'),('a2','b','p'),('other','other','p');
      INSERT INTO channel VALUES ('meta','meta_ads');
      INSERT INTO platform_audience VALUES ('seed',NULL,'p','b','123','meta','2026-01-01'),('explicit','a1',NULL,'b','456','meta','2026-02-01');`);
    for (const statement of campaignAudienceStatements)
      await pg.exec(statement);
    const links = await pg.query<{
      audience_id: string;
      platform_audience_id: string;
    }>(
      `SELECT audience_id, platform_audience_id FROM campaign_audience_asset ORDER BY audience_id`,
    );
    expect(links.rows).toEqual([
      { audience_id: "a1", platform_audience_id: "explicit" },
      { audience_id: "a2", platform_audience_id: "seed" },
    ]);
    await pg.exec(
      `INSERT INTO audience VALUES ('a3','b',NULL); INSERT INTO campaign_audience_asset VALUES ('shared','a3','seed','meta_ads'); DELETE FROM campaign_audience_asset WHERE audience_id='a2';`,
    );
    for (const statement of campaignAudienceStatements)
      await pg.exec(statement);
    expect(
      (
        await pg.query(
          `SELECT * FROM campaign_audience_asset WHERE audience_id='a2'`,
        )
      ).rows,
    ).toHaveLength(0);
    await pg.exec(`DELETE FROM audience WHERE id='a3'`);
    expect(
      (await pg.query(`SELECT * FROM platform_audience WHERE id='seed'`)).rows,
    ).toHaveLength(1);
    let rejected = false;
    try {
      await pg.exec(
        `INSERT INTO campaign_audience_asset VALUES ('invalid','missing','seed','meta_ads')`,
      );
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  } finally {
    await pg.close();
  }
});
