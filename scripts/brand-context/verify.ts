import { effectiveVoice } from "@/lib/brand-direction";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, memberTable, personaTable } from "@/server/db/schema";
import { updateBrandStory } from "@/server/services/brand-story.service";
import { suggestBrandMarkets } from "@/server/services/brand-markets.service";
import {
  suggestPersonas,
  updatePersona,
} from "@/server/ai/capabilities/personas";
import { getBrand } from "@/server/ai/capabilities/brands";
if (!process.env.DB_EXPERIMENT_BRANCH?.startsWith("experiment/"))
  throw new Error("Run verification on a disposable database experiment.");
const brand = await db.query.brandTable.findFirst({
  where: and(
    eq(brandTable.slug, "hollyhock-suites"),
    isNull(brandTable.deletedAt),
  ),
});
if (!brand?.organizationId) throw new Error("Hollyhock brand missing");
const member = await db.query.memberTable.findFirst({
  where: eq(memberTable.organizationId, brand.organizationId),
});
if (!member) throw new Error("Workspace membership missing");
const ctx = {
  orgId: brand.organizationId,
  userId: member.userId,
  runId: "brand-context-verification",
  surface: "test" as const,
};
if (!process.argv.includes("--skip-story")) {
  console.log("Generating Hollyhock story with explicit steering");
  const story = await updateBrandStory({
    brandId: brand.id,
    steer:
      "Keep the brand's supported positioning. Choose the Guide archetype. Never say 'luxury getaway'. Preserve specific supported destination and guest context.",
  });
  if (
    effectiveVoice(story.creativeDirection).understatedExpressive > 1 ||
    !story.creativeDirection.neverSay.some((s) =>
      s.toLowerCase().includes("luxury getaway"),
    )
  )
    throw new Error("Story generation failed to respect explicit steer");
  console.log("Story steering respected", story.creativeDirection.voice);
}
const markets = await suggestBrandMarkets({
  brandId: brand.id,
  steer:
    "Preserve the existing town grouping. Explain guest origins as suggestions, never measured bookings.",
});
console.log(
  "Destinations proposed",
  markets.markets.map((m) => m.label),
);
const existing = await db.query.personaTable.findFirst({
  where: and(
    eq(personaTable.brandId, brand.id),
    isNull(personaTable.deletedAt),
  ),
});
const proposals = await suggestPersonas.runValidated(
  {
    brandId: brand.id,
    ...(existing ? { personaId: existing.id } : {}),
    steer:
      "Preserve the persona's central motivation. Explicitly describe assumed booking windows and price sensitivity as unknown unless supported. Use only supplied home IDs.",
  },
  ctx,
);
if (existing && proposals.suggestions[0])
  await updatePersona.runValidated(
    { personaId: existing.id, ...proposals.suggestions[0] },
    ctx,
  );
console.log("Persona profile generated", proposals.suggestions.length);
await getBrand.runValidated({ brandId: brand.id }, ctx);
console.log("Brand context output contract valid");
// These checks cover the consequential boundaries added by structured profiles.
let rejected = false;
try {
  await getBrand.runValidated(
    { brandId: brand.id },
    { ...ctx, orgId: "org_foreign_verification" },
  );
} catch {
  rejected = true;
}
if (!rejected) throw new Error("Cross-workspace brand context was exposed");
console.log("Workspace boundary valid");
