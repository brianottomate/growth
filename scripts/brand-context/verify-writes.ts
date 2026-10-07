import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { setBrandStory } from "@/server/services/brand-story.service";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Use a disposable experiment");
const source = await db.query.brandTable.findFirst({
  where: and(
    eq(brandTable.slug, "hollyhock-suites"),
    isNull(brandTable.deletedAt),
  ),
});
if (!source?.story || !source.creativeDirection)
  throw new Error("Generate the experiment brand context first");
// Regression: a direction-only write previously supplied stale/absent story text.
const saved = await setBrandStory({
  brandId: source.id,
  creativeDirection: source.creativeDirection,
});
if (saved.story !== source.story)
  throw new Error("Direction-only write changed the story");
const storyOnly = await setBrandStory({
  brandId: source.id,
  story: source.story,
});
if (
  JSON.stringify(storyOnly.creativeDirection) !==
  JSON.stringify(source.creativeDirection)
)
  throw new Error("Story-only write changed direction");
console.log("Targeted story/direction writes preserve the other field");
