import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { personaProfileSchema } from "@/lib/persona-profile";

test("persona cutover preserves ordered phrases and audience links, drops evidence, and replays without overwriting edits", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE persona (id text PRIMARY KEY, profile jsonb);
      CREATE TABLE audience (persona_id text REFERENCES persona(id));`);
    const legacy = {
      motivation: "Plan a family trip.",
      needs: ["Enough bedrooms", "Enough bedrooms"],
      decisionCriteria: ["Short beach walk"],
      objections: ["Misleading photos"],
      evidenceNote: "Old evidence note.",
    };
    const edited = {
      icon: "heart",
      motivation: "Keep my edit.",
      pills: ["Trusted host"],
    };
    await pg.query(
      "INSERT INTO persona VALUES ('old', $1), ('edited', $2), ('empty', null)",
      [legacy, edited],
    );
    await pg.exec("INSERT INTO audience VALUES ('old')");
    const migration = await Bun.file(
      new URL("../drizzle/0024_compact_persona_profiles.sql", import.meta.url),
    ).text();
    await pg.exec(migration);
    await pg.exec(migration);
    const rows = (
      await pg.query<{ id: string; profile: unknown }>(
        "SELECT * FROM persona ORDER BY id",
      )
    ).rows;
    expect(rows).toEqual([
      { id: "edited", profile: edited },
      { id: "empty", profile: null },
      {
        id: "old",
        profile: {
          icon: "users",
          motivation: legacy.motivation,
          pills: [
            ...legacy.needs,
            ...legacy.decisionCriteria,
            ...legacy.objections,
          ],
        },
      },
    ]);
    expect(personaProfileSchema.parse(rows[2]!.profile)).toEqual({
      icon: "users",
      motivation: legacy.motivation,
      pills: [
        "Enough bedrooms",
        "Enough bedrooms",
        "Short beach walk",
        "Misleading photos",
      ],
    });
    expect((await pg.query("SELECT * FROM audience")).rows).toEqual([
      { persona_id: "old" },
    ]);
  } finally {
    await pg.close();
  }
});
