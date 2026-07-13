import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  CONTENT_ARTIFACT_KINDS,
  readContentAnalysis,
} from "@/lib/content-analysis";
import { fetchNewsletterContent } from "@/server/clients/cio-content";
import {
  brandInspirationTable,
  brandTable,
  memberTable,
  platformPostTable,
  webPageTable,
} from "@/server/db/schema";
import {
  analyzeContentArtifact,
  analyzeWebsitePortfolio,
  loadReadableSource,
  normalizeContentSource,
} from "@/server/services/content-analysis.service";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const metadataText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

export const contentAnalysisRouter = createTRPCRouter({
  analyzeWebsitePortfolio: protectedProcedure
    .input(
      z.object({
        brandId: z.string().optional(),
        includeSavedPageAnalyses: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.query.memberTable.findFirst({
        where: eq(memberTable.userId, ctx.session.user.id),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const brands = await ctx.db.query.brandTable.findMany({
        where: and(
          eq(brandTable.organizationId, membership.organizationId),
          isNull(brandTable.deletedAt),
          input.brandId ? eq(brandTable.id, input.brandId) : undefined,
        ),
        columns: { id: true, name: true },
      });
      if (!brands.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.brandId ? "Owned brand not found" : "No brands found",
        });
      }

      const brandIds = brands.map((brand) => brand.id);
      const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
      const pages = await ctx.db.query.webPageTable.findMany({
        where: and(
          inArray(webPageTable.brandId, brandIds),
          eq(webPageTable.isActive, true),
          isNull(webPageTable.deletedAt),
        ),
        orderBy: (page, { asc }) => [asc(page.brandId), asc(page.path)],
        limit: 80,
      });
      if (!pages.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sync a website before analyzing its page system",
        });
      }

      const analysis = await analyzeWebsitePortfolio({
        scopeLabel:
          brands.length === 1 ? `${brands[0]!.name} website` : "all websites",
        brandIds,
        brandNames: brands.map((brand) => brand.name),
        includeSavedPageAnalyses: input.includeSavedPageAnalyses,
        pages: pages.map((page) => {
          const metadata =
            page.metadata && typeof page.metadata === "object"
              ? (page.metadata as Record<string, unknown>)
              : {};
          return {
            brandName: brandNames.get(page.brandId) ?? "Unknown brand",
            path: page.path,
            url: page.url,
            pageType: page.pageType,
            title: page.title,
            description: page.description,
            ogImage: page.ogImage,
            ogWidth: metadataText(metadata.ogImageWidth, "") || null,
            ogHeight: metadataText(metadata.ogImageHeight, "") || null,
            twitterCard: metadataText(metadata.twitterCard, "") || null,
            canonical: metadataText(metadata.canonical, "") || null,
            savedAnalysis: readContentAnalysis(metadata),
          };
        }),
      });

      // A single-brand analysis has a natural durable home. All-brand analyses
      // are intentionally transient until the workspace has organization-level
      // analysis storage rather than duplicating one result across brands.
      if (brands.length === 1) {
        const home =
          pages.find((page) => page.pageType === "home") ??
          pages.find((page) => page.path === "/") ??
          pages[0];
        if (home) {
          const metadata =
            home.metadata && typeof home.metadata === "object"
              ? (home.metadata as Record<string, unknown>)
              : {};
          await ctx.db
            .update(webPageTable)
            .set({ metadata: { ...metadata, portfolioAnalysis: analysis } })
            .where(eq(webPageTable.id, home.id));
        }
      }

      return analysis;
    }),
  analyze: protectedProcedure
    .input(
      z.object({
        kind: z.enum(CONTENT_ARTIFACT_KINDS),
        id: z.string(),
        steer: z.string().trim().max(1_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "website") {
        const page = await ctx.db.query.webPageTable.findFirst({
          where: eq(webPageTable.id, input.id),
          with: { brand: true },
        });
        if (!page?.brand?.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
        }
        const membership = await ctx.db.query.memberTable.findFirst({
          where: and(
            eq(memberTable.userId, ctx.session.user.id),
            eq(memberTable.organizationId, page.brand.organizationId),
          ),
        });
        if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
        const source = await loadReadableSource(page.url);
        if (!source) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The live page could not be read",
          });
        }
        const pageMetadata =
          page.metadata && typeof page.metadata === "object"
            ? (page.metadata as Record<string, unknown>)
            : {};
        const analysisSource = `PUBLISHED PAGE METADATA
Title: ${metadataText(pageMetadata.ogTitle, page.title)}
Description: ${metadataText(pageMetadata.ogDescription, page.description ?? "Not published")}
OG image: ${page.ogImage ?? "Not published"}
OG dimensions: ${metadataText(pageMetadata.ogImageWidth, "unknown")} × ${metadataText(pageMetadata.ogImageHeight, "unknown")}
Twitter card: ${metadataText(pageMetadata.twitterCard, "Not published")}
Canonical: ${metadataText(pageMetadata.canonical, "Not published")}

PAGE CONTENT
${source}`;
        const analysis = await analyzeContentArtifact({
          kind: "website",
          brandName: page.brand.name,
          brandContext:
            page.brand.tagline ?? page.brand.description ?? page.brand.website,
          title: page.title,
          source: analysisSource,
          sourceUrl: page.url,
          imageUrl: page.ogImage,
          steer: input.steer,
        });
        await ctx.db
          .update(webPageTable)
          .set({ metadata: { ...pageMetadata, aiAnalysis: analysis } })
          .where(eq(webPageTable.id, page.id));
        return analysis;
      }

      const expectedKind = input.kind === "blog" ? "blog_article" : "broadcast";
      const post = await ctx.db.query.platformPostTable.findFirst({
        where: and(
          eq(platformPostTable.id, input.id),
          eq(platformPostTable.externalKind, expectedKind),
        ),
        with: { brand: true },
      });
      if (!post?.brand) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Artifact not found",
        });
      }
      const memberships = await ctx.db.query.memberTable.findMany({
        where: eq(memberTable.userId, ctx.session.user.id),
      });
      const organizationIds = memberships.map(
        (membership) => membership.organizationId,
      );
      let hasAccess = post.brand.organizationId
        ? organizationIds.includes(post.brand.organizationId)
        : false;
      if (!hasAccess && !post.brand.organizationId && organizationIds.length) {
        const ownedBrands = await ctx.db.query.brandTable.findMany({
          where: inArray(brandTable.organizationId, organizationIds),
          columns: { id: true },
        });
        const ownedBrandIds = ownedBrands.map((brand) => brand.id);
        if (ownedBrandIds.length) {
          const inspiration =
            await ctx.db.query.brandInspirationTable.findFirst({
              where: and(
                inArray(brandInspirationTable.brandId, ownedBrandIds),
                eq(brandInspirationTable.inspirationBrandId, post.brand.id),
              ),
            });
          hasAccess = Boolean(inspiration);
        }
      }
      if (!hasAccess) throw new TRPCError({ code: "FORBIDDEN" });

      let source: string | null = null;
      let title = post.text ?? "Untitled";
      if (input.kind === "newsletter" && post.externalId) {
        const content = await fetchNewsletterContent(post.externalId);
        if (content?.body) {
          source = normalizeContentSource(content.body);
          title = content.subject ?? title;
        }
      }
      if (!source && post.externalUrl) {
        source = await loadReadableSource(post.externalUrl);
      }
      if (!source) {
        const metadata = post.metadata as Record<string, unknown> | null;
        source = normalizeContentSource(
          JSON.stringify(metadata?.inspiration ?? metadata ?? post.text ?? ""),
        );
      }
      if (!source) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The artifact has no readable content",
        });
      }
      const storedMetadata =
        post.metadata && typeof post.metadata === "object"
          ? (post.metadata as Record<string, unknown>)
          : {};
      const contentContext = `PUBLISHED ARTIFACT METADATA
Title: ${title}
Description: ${metadataText(storedMetadata.metaDescription ?? storedMetadata.description, "Not available")}
Cover / OG image: ${metadataText(storedMetadata.ogImage, post.media?.[0]?.url ?? "Not available")}
Published at: ${post.publishedAt?.toISOString() ?? "Unknown"}
Provider: ${post.provider ?? "Unknown"}

ARTIFACT CONTENT
${source}`;

      const analysis = await analyzeContentArtifact({
        kind: input.kind,
        brandName: post.brand.name,
        brandContext:
          post.brand.tagline ?? post.brand.description ?? post.brand.website,
        title,
        source: contentContext,
        sourceUrl: post.externalUrl,
        imageUrl:
          metadataText(storedMetadata.ogImage, "") ||
          post.media?.[0]?.url ||
          null,
        steer: input.steer,
      });
      await ctx.db
        .update(platformPostTable)
        .set({ metadata: { ...storedMetadata, aiAnalysis: analysis } })
        .where(eq(platformPostTable.id, post.id));
      return analysis;
    }),
});
