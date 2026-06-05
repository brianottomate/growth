import { type Config } from "drizzle-kit";

import { env } from "@/env";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // `leads` lives in its own Postgres schema (see leads-schema.ts) so it stays
  // decoupled and droppable. push/introspect must be told to manage it too.
  schemaFilter: ["public", "leads"],
  casing: "snake_case",
} satisfies Config;
