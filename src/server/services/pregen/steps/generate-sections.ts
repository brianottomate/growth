import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeCrawlPageTable,
  type PregenNativePage,
} from "@/server/db/schema";
import { generateHomepageCopy } from "../generation/copy";

import type { StepContext } from "../pipeline";

/**
 * Homepage copy generation (monolith: the templated HOMEPAGE path of the
 * siteEditorBuildPage child workflow, minus images/SEO). Template + brand kit
 * + homepage source → merged sections, checkpointed as the build's draft.
 */
export async function generateSectionsStep(ctx: StepContext) {
  const [build, homepage] = await Promise.all([
    db.query.pregenNativeBuildTable.findFirst({
      where: eq(pregenNativeBuildTable.id, ctx.buildId),
      columns: { brandKit: true },
      with: { prospect: { columns: { name: true, domain: true } } },
    }),
    db.query.pregenNativeCrawlPageTable.findFirst({
      where: and(
        eq(pregenNativeCrawlPageTable.buildId, ctx.buildId),
        eq(pregenNativeCrawlPageTable.kind, "homepage"),
      ),
      columns: { markdown: true, metadata: true },
    }),
  ]);

  if (!homepage?.markdown) {
    throw new Error("generate_sections: no homepage capture for this build");
  }

  const brandKit = build?.brandKit ?? undefined;

  const { sections, usedFallback } = await generateHomepageCopy({
    tone: "existing",
    evaluation: brandKit,
    source: {
      title: asString(homepage.metadata?.title),
      description: asString(homepage.metadata?.description),
      markdown: homepage.markdown,
    },
  });

  const businessName =
    brandKit?.businessName ??
    build?.prospect.name ??
    build?.prospect.domain ??
    "";
  const hero = sections.find((s) => s.type === "homepage-hero");

  const homepageDraft: PregenNativePage = {
    slug: "home",
    name: "Home",
    kind: "HOMEPAGE",
    titleTag: businessName || null,
    descriptionTag: asString(hero?.description) ?? null,
    sections,
  };

  await db
    .update(pregenNativeBuildTable)
    .set({
      draftConfig: {
        title: businessName,
        description: asString(hero?.description) ?? "",
        heroTitle: asString(hero?.title) ?? null,
      },
      draftPages: [homepageDraft],
    })
    .where(eq(pregenNativeBuildTable.id, ctx.buildId));

  return { sections: sections.length, copyFallback: usedFallback ? 1 : 0 };
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
