/** Additive migration. Set DATABASE_URL to the explicitly selected database. */
import { withTransaction } from "@/server/db";
import { sql } from "drizzle-orm";

const statements = `
  ALTER TABLE assistant_thread ADD COLUMN IF NOT EXISTS active_turn_id text;
  ALTER TABLE assistant_thread ADD COLUMN IF NOT EXISTS active_turn_expires_at timestamp;
  ALTER TABLE assistant_thread ADD COLUMN IF NOT EXISTS queue_paused boolean NOT NULL DEFAULT false;
  ALTER TABLE assistant_thread ADD COLUMN IF NOT EXISTS stop_requested boolean NOT NULL DEFAULT false;
  CREATE TABLE IF NOT EXISTS assistant_input (
    id text PRIMARY KEY,
    sequence integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    thread_id text NOT NULL REFERENCES assistant_thread(id) ON DELETE CASCADE,
    created_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'queued',
    target_turn_id text,
    payload jsonb NOT NULL,
    error text,
    created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS assistant_input_thread_sequence_idx ON assistant_input(thread_id, sequence);
`
  .split(";")
  .filter((statement) => statement.trim());
await withTransaction(async (tx) => {
  for (const statement of statements) await tx.execute(sql.raw(statement));
});
console.log("Chat turn control schema is ready.");
