/** Verify retirement against session-local temporary tables, then roll back. */
import postgres from "postgres";
import { launchRetirementStatements } from "./production-schema-contract";
import { env } from "@/env";

const client = postgres(env.DATABASE_URL, {
  max: 1,
  onnotice: () => undefined,
});
const rollback = new Error("verification rollback");
try {
  await client.begin(async (tx) => {
    await tx`create temporary table product (id text primary key)`;
    await tx`create temporary table launch (id text primary key, product_id text references pg_temp.product(id))`;
    await tx`insert into pg_temp.product values ('keep-product')`;
    await tx`insert into pg_temp.launch values ('retired', 'keep-product')`;
    for (const table of ["campaign", "series", "content_post"]) {
      await tx.unsafe(
        `create temporary table ${table} (id text primary key, name text, launch_id text references pg_temp.launch(id) on delete set null)`,
      );
      await tx.unsafe(
        `insert into pg_temp.${table} values ('keep-${table}', 'Keep my work', 'retired')`,
      );
    }
    const source = await Bun.file(
      new URL("./retire-launch-schema.sql", import.meta.url),
    ).text();
    // All targets are redirected to this connection's temporary namespace.
    // Never execute the public-schema migration in this verification script.
    const statements = launchRetirementStatements(
      source.replaceAll("public.", "pg_temp."),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const statement of statements) await tx.unsafe(statement);
      for (const table of ["product", "campaign", "series", "content_post"]) {
        const rows = await tx.unsafe(`select * from pg_temp.${table}`);
        if (
          rows.length !== 1 ||
          rows[0]?.id !== `keep-${table}` ||
          "launch_id" in rows[0]
        )
          throw new Error(
            `${table}: retirement must preserve the original row and remove only the launch link`,
          );
      }
      const [removed] =
        await tx`select to_regclass('pg_temp.launch') is null as gone`;
      if (!removed?.gone) throw new Error("The launch table must be removed");
    }
    console.log(
      "Verified Launches removal, linked-work preservation, and migration replay using temporary tables only.",
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await client.end();
}
