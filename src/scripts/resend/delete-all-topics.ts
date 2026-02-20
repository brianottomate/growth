/**
 * Delete specified Resend topics
 *
 * Use this to clean up topics that need to be removed or recreated.
 * Update the TOPICS_TO_DELETE array below with your topic IDs before running.
 *
 * Usage:
 *   bun src/scripts/resend/delete-all-topics.ts
 */

import { Resend } from "resend";

// Add your topic IDs here
const TOPICS_TO_DELETE: string[] = [
  // Example:
  // "topic-id-1", // General Newsletter
  // "topic-id-2", // Product Updates
];

async function main() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: RESEND_API_KEY environment variable is required");
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  console.log("🔍 Fetching existing topics to verify...\n");

  const { data: existingTopics, error: listError } = await resend.topics.list();

  if (listError) {
    console.error("❌ Error fetching topics:", listError);
    process.exit(1);
  }

  console.log(
    `📋 Found ${existingTopics?.data?.length || 0} existing topic(s)\n`,
  );

  if (!existingTopics?.data || existingTopics.data.length === 0) {
    console.log("✅ No topics to delete!");
    return;
  }

  console.log("🗑️  Deleting topics...\n");
  console.log("⏱️  Adding delays to respect rate limit (2 requests/sec)...\n");

  let successCount = 0;
  let errorCount = 0;

  for (const topicId of TOPICS_TO_DELETE) {
    // Find the topic name for better logging
    const topic = existingTopics.data.find((t) => t.id === topicId);
    const topicName = topic?.name || "Unknown";

    console.log(`Deleting: ${topicName}`);
    console.log(`   ID: ${topicId}`);

    try {
      const { error } = await resend.topics.remove(topicId);

      if (error) {
        console.error(
          `   ❌ Failed: ${error.message || (error as Error).message}\n`,
        );
        errorCount++;

        // If rate limited, wait longer
        if (error.message?.includes("Too many requests")) {
          console.log("   ⏳ Waiting 2 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } else {
        console.log(`   ✅ Deleted successfully\n`);
        successCount++;
      }
    } catch (error) {
      console.error(
        `   ❌ Failed:`,
        error instanceof Error ? error.message : error,
      );
      console.log("");
      errorCount++;
    }

    // Rate limit: wait 600ms between requests (under 2 req/sec)
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  console.log("✨ Done!");
  console.log(`   ✅ Deleted: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log("\n💡 Next steps:");
  console.log("   1. Run: bun src/scripts/resend/create-topics.ts");
  console.log("   2. Update NEWSLETTER_TOPICS with the new IDs");
  console.log("   3. Users will now need to explicitly opt-in to topics");
}

void main();
