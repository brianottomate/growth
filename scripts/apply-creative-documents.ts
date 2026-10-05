import postgres from "postgres";
import { migrateCreativeDocuments } from "./migrate-creative-documents";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 1, onnotice: () => undefined });
const apply = process.argv.includes("--apply");
const rollback = new Error("Dry run complete");
try {
  await client.begin(async (tx) => {
    console.log(
      await migrateCreativeDocuments(
        tx,
        process.argv.includes("--retire-legacy"),
      ),
    );
    if (!apply) throw rollback;
  });
  console.log("Creative document migration committed.");
} catch (error) {
  if (error !== rollback) throw error;
  console.log("Dry run validated and rolled back.");
} finally {
  await client.end();
}
