import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { migrateCreativeDocuments } from "./migrate-creative-documents";

const database = new PGlite();
const migrate = (retire = false) =>
  database.transaction((tx) =>
    migrateCreativeDocuments(
      { unsafe: async (sql) => (await tx.query(sql)).rows },
      retire,
    ),
  );
beforeAll(async () => {
  await database.exec(`CREATE TABLE brand (id text PRIMARY KEY, organization_id text);
CREATE TABLE content_post (id text PRIMARY KEY, title text, body text, cta_text text);
CREATE TABLE platform_post (id text PRIMARY KEY, brand_id text, content_post_id text);
CREATE TABLE production_packet (id text PRIMARY KEY, organization_id text, brand_id text, content_post_id text, title text, purpose text, prompt text NOT NULL, negative_prompt text, aspect_ratio text, output_format text, instructions text, "references" jsonb DEFAULT '[]', status text, created_by text, created_at timestamp, updated_at timestamp);
CREATE TABLE creative_run (id text PRIMARY KEY, packet_id text REFERENCES production_packet(id), status text);
CREATE TABLE email_document (id text PRIMARY KEY, platform_post_id text, subject text, preheader text, body_markdown text, cta_label text, cta_url text, template_key text, handoff_target_repo text, product_update jsonb, digest jsonb, created_by text, created_at timestamp, updated_at timestamp);
CREATE TABLE email_document_version (id text PRIMARY KEY);
CREATE TABLE email_generation_job (id text PRIMARY KEY, status text);
CREATE TABLE message_send (id text PRIMARY KEY, email_document_id text REFERENCES email_document(id), email_document_version_id text REFERENCES email_document_version(id), revision integer);
INSERT INTO brand VALUES ('brand','org');
INSERT INTO content_post VALUES ('idea','Newsletter idea','Saved brief','Read more');
INSERT INTO platform_post VALUES ('spot','brand','idea');
INSERT INTO production_packet (id,brand_id,organization_id,title,prompt,negative_prompt,created_at,updated_at) VALUES ('image','brand','org','Hero','Keep the supplied house','No invented features',now(),now());
INSERT INTO email_document VALUES ('email','spot','Edited subject','Edited preview','Edited body','Read more','https://wander.com','editorial',null,null,null,'user',now(),now());`);
});
afterAll(() => database.close());

test("cutover preserves current operator edits and typed ownership; replay does not overwrite newer work", async () => {
  await migrate();
  const { rows } = await database.query<{
    document: {
      type: string;
      content: { subject: string; bodyMarkdown: string };
    };
    content_post_id: string;
  }>(
    "SELECT document,content_post_id FROM production_packet WHERE id='pkt_email'",
  );
  expect(rows[0]?.document.content).toMatchObject({
    subject: "Edited subject",
    bodyMarkdown: "Edited body",
  });
  expect(rows[0]?.content_post_id).toBe("idea");
  expect(
    (await database.query("SELECT * FROM platform_document")).rows,
  ).toEqual([{ platform_post_id: "spot", document_id: "pkt_email" }]);
  await database.exec(
    `UPDATE production_packet SET document=jsonb_set(document,'{content,subject}','"New edit"'), updated_at=now()+interval '1 minute' WHERE id='pkt_email'`,
  );
  await migrate();
  expect(
    (
      await database.query<{ subject: string }>(
        "SELECT document->'content'->>'subject' AS subject FROM production_packet WHERE id='pkt_email'",
      )
    ).rows[0]?.subject,
  ).toBe("New edit");
});

test("database prevents a second active production attempt while allowing retry after cancellation", async () => {
  await database.exec(
    "INSERT INTO creative_run (id,packet_id,status) VALUES ('first','image','queued')",
  );
  expect(
    database.exec(
      "INSERT INTO creative_run (id,packet_id,status) VALUES ('second','image','processing')",
    ),
  ).rejects.toThrow();
  await database.exec(
    "UPDATE creative_run SET status='cancelled' WHERE id='first'",
  );
  await database.exec(
    "INSERT INTO creative_run (id,packet_id,status) VALUES ('retry','image','queued')",
  );
  await database.exec(
    "UPDATE creative_run SET status='ready' WHERE id='retry'",
  );
});

test("retirement refuses to discard legacy delivery snapshots and rolls back", async () => {
  await database.exec(
    "INSERT INTO message_send (id,email_document_id,revision) VALUES ('send','email',1)",
  );
  expect(migrate(true)).rejects.toThrow("Legacy email delivery records");
  expect(
    (await database.query("SELECT * FROM email_document")).rows,
  ).toHaveLength(1);
  await database.exec("DELETE FROM message_send WHERE id='send'");
});

test("final retirement is repeatable and database rejects row/JSON type mismatch", async () => {
  await migrate(true);
  await migrate(true);
  expect(
    (await database.query("SELECT * FROM production_packet")).rows,
  ).toHaveLength(2);
  expect(
    database.exec(
      "UPDATE production_packet SET document_type='video' WHERE id='image'",
    ),
  ).rejects.toThrow();
  expect(
    database.exec(
      "UPDATE production_packet SET document=null WHERE id='image'",
    ),
  ).rejects.toThrow();
  expect(
    database.exec(
      "UPDATE production_packet SET document=document-'type' WHERE id='image'",
    ),
  ).rejects.toThrow();
});
