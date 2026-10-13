import { type Config } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL_DIRECT ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;

export default {
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  // Generation/checking must work without app or production credentials.
  ...(databaseUrl
    ? {
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : {}),
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  // `leads` and `email` live in their own Postgres schemas (leads-schema.ts,
  // email-list-schema.ts) so they stay decoupled and droppable.
  schemaFilter: ["public", "leads", "email"],
  casing: "snake_case",
} satisfies Config;
