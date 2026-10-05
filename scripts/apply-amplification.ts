import postgres from "postgres";
import { migrateAmplification } from "./migrate-amplification";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL required");
const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
try {
  await client.begin(migrateAmplification);
  console.log("Amplification migration applied.");
} finally {
  await client.end();
}
