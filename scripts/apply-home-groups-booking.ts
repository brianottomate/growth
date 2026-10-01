/** Additive, transactional migration. Safe while the previous release is serving. */
import postgres from "postgres";
import { env } from "@/env";
const client = postgres(env.DATABASE_URL, { max: 1 });
try {
  const ddl = await Bun.file(
    new URL("./sql/home-groups-booking.sql", import.meta.url),
  ).text();
  await client.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  console.log(
    "Home groups and booking targets migrated; Featured selections preserved.",
  );
} finally {
  await client.end();
}
