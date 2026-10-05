import postgres from "postgres";
import { migrateCampaignAudiences } from "./migrate-campaign-audiences";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await client.begin(async (tx) => {
    await migrateCampaignAudiences(tx);
  });
  console.log("Connected campaign audience migration committed.");
} finally {
  await client.end();
}
