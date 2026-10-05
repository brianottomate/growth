import { type Config } from "drizzle-kit";

export default {
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  // Generation/checking must work without app or production credentials.
  ...((process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL)
    ? {
        dbCredentials: {
          url: (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL)!,
        },
      }
    : {}),
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  // `leads` lives in its own Postgres schema (see leads-schema.ts) so it stays
  // decoupled and droppable. introspection includes both schemas.
  schemaFilter: ["public", "leads"],
  casing: "snake_case",
} satisfies Config;
