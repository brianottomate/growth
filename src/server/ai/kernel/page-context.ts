import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  contentPostTable,
  platformPostTable,
  productTable,
  seriesTable,
  storefrontTable,
} from "@/server/db/schema";
import { getSafeInternalPath } from "@/lib/auth-utils";

function guidanceForPath(pathname: string): string | null {
  if (pathname === "/app/next")
    return "This is the conversational home. All canonical workspace capabilities remain available; the current location guides the answer but does not limit what the operator can ask Growth to do.";
  if (pathname.startsWith("/app/review"))
    return "This is the production review surface. Start with contentRead action productionQueue when the operator asks what needs attention.";
  if (pathname.startsWith("/app/brands"))
    return "This is a brand map surface. Use brandRead for current state and strategyRead or strategyWrite for agreed channel and mix work.";
  if (pathname.startsWith("/app/channels"))
    return "This is the channel strategy surface. Use brandRead and strategyRead before proposing or applying cadence changes.";
  if (pathname.startsWith("/app/website"))
    return "This is the owned website surface. Use brandRead for mapped state and sourceSyncWrite only for an explicitly requested audit or synchronization.";
  if (pathname.startsWith("/app/product-atlas"))
    return "This is Product Atlas. Use productAtlasRead before productAtlasWrite.";
  if (pathname.startsWith("/app/apps"))
    return "This is the storefront workspace. Use storefrontRead before storefrontWrite.";
  if (pathname.startsWith("/app/audiences"))
    return "This is the audience strategy surface. Use audienceRead before audienceWrite.";
  if (
    pathname.startsWith("/app/content") ||
    pathname.startsWith("/app/calendar")
  )
    return "This is a content planning surface. Use contentRead before contentWrite, and use contentStrategy or planning capabilities when the request concerns structure or cadence.";
  if (pathname.startsWith("/app/campaigns"))
    return "This is the campaign and moment surface. Planning, amplification, content, and ads capabilities can inspect or operate their owned parts, but Growth does not currently advertise a general campaign CRUD capability.";
  if (pathname.startsWith("/app/feed"))
    return "This is a publishing surface. Use publishingRead and contentRead for live workspace state.";
  if (pathname.startsWith("/app/blog"))
    return "This is the Growth blog workspace. Use contentRead for canonical work and contentWrite action publishBlogDraft only for an explicitly requested DatoCMS draft.";
  if (pathname.startsWith("/app/newsletters"))
    return "This is the editorial newsletter workspace. Use emailRead before emailWrite.";
  if (pathname.startsWith("/app/transactional"))
    return "This is the product-event email registry. Transactional messages fire from product events and are separate from editorial newsletters; no general transactional AI write capability is currently advertised.";
  if (pathname.startsWith("/app/ads"))
    return "This is the paid media surface. Use adsRead for scoped performance, alignment, and conversion inspection.";
  if (pathname.startsWith("/app/inbox"))
    return "This is the engagement inbox. listeningRead can inspect recent triage state, but Growth does not currently advertise provider reply actions.";
  if (pathname.startsWith("/app/listen"))
    return "This is the listening workspace. Use listeningRead for recent mentions and triage.";
  if (pathname.startsWith("/app/lifecycle"))
    return "This is the lifecycle workspace. Use lifecycleRead before lifecycleWrite. Customer.io and Outreach remain Growth-only provider integrations.";
  if (pathname.startsWith("/app/media"))
    return "This is the media library. Growth-only Drive and upload capabilities remain available here alongside media analysis.";
  if (pathname.startsWith("/app/pillars") || pathname.startsWith("/app/series"))
    return "This is a content-structure surface. Use contentStrategyRead before contentStrategyWrite.";
  if (pathname.startsWith("/app/people"))
    return "This is the people and amplifier surface. Use amplificationRead before amplificationWrite.";
  if (pathname.startsWith("/app/leads"))
    return "This is the Growth lead workspace. leadsRead currently provides the pipeline summary; Outreach, Customer.io, HubSpot, and Instantly remain Growth-only provider workflows.";
  if (pathname.startsWith("/app/spend"))
    return "This is the spend workspace. Spend is intentionally reserved for its own agent and is not part of the global Growth capability catalog.";
  if (pathname.startsWith("/app/affiliate"))
    return "This is the affiliate operations desk. Growth does not currently advertise affiliate actions to the global assistant.";
  return null;
}

/**
 * Resolve the page the operator is looking at into a prompt section, so "this
 * series" / "this page" refers to what is actually on their screen. Entity
 * routes are verified against the caller's organization before anything is
 * named; unknown or foreign paths degrade to the bare location line, which is
 * still enough for orientation and navigation questions.
 */
export async function composePageContextSection(options: {
  pagePath: string | undefined;
  organizationId: string;
}): Promise<string> {
  const path = getSafeInternalPath(options.pagePath ?? null);
  if (!path?.startsWith("/app")) return "";

  const pathname = path.split(/[?#]/)[0]!;
  const header = `# Operator location\nThe operator currently has ${path} open in the growth workspace. When they say "this page", "this one", "here", or point at something without naming it, they mean what is on this surface.`;

  const seriesId = /^\/app\/series\/([^/]+)$/.exec(pathname)?.[1];
  if (seriesId) {
    const series = await db.query.seriesTable.findFirst({
      where: and(eq(seriesTable.id, seriesId), isNull(seriesTable.deletedAt)),
      with: {
        brand: { columns: { id: true, name: true, organizationId: true } },
      },
    });
    if (series?.brand.organizationId !== options.organizationId) return header;
    return `${header}\nThis is the series page for “${series.name}” (seriesId: ${series.id}, status: ${series.status}) for ${series.brand.name} (brandId: ${series.brand.id}). Read the surrounding structure with contentStrategyRead action get before making claims about it; edit the series itself with contentStrategyWrite action saveSeries.`;
  }

  const contentPostId = /^\/app\/content\/([^/]+)$/.exec(pathname)?.[1];
  if (contentPostId) {
    const post = await db.query.contentPostTable.findFirst({
      where: and(
        eq(contentPostTable.id, contentPostId),
        isNull(contentPostTable.deletedAt),
      ),
      with: {
        brand: { columns: { id: true, name: true, organizationId: true } },
      },
    });
    if (post?.brand?.organizationId !== options.organizationId) return header;
    return `${header}\nThis is the content idea “${post.title ?? "Untitled"}” (contentPostId: ${post.id}) for ${post.brand.name} (brandId: ${post.brand.id}). Call contentRead action getWorkItem before making claims about its readiness or copy.`;
  }

  const blogPostId = /^\/app\/blog\/([^/]+)$/.exec(pathname)?.[1];
  if (blogPostId) {
    const post = await db.query.platformPostTable.findFirst({
      where: and(
        eq(platformPostTable.id, blogPostId),
        eq(platformPostTable.externalKind, "blog_article"),
      ),
      with: {
        brand: { columns: { id: true, name: true, organizationId: true } },
      },
    });
    if (post?.brand?.organizationId !== options.organizationId) return header;
    const status =
      post.publishedAt && post.status === "published" ? "published" : "draft";
    return `${header}\nThis is the ${status} blog article “${post.text ?? "Untitled"}” (platformPostId: ${post.id}${post.externalId ? `, Dato itemId: ${post.externalId}` : ""}) for ${post.brand.name} (brandId: ${post.brand.id}). Use blogAgent to read, review, or edit this article. When the operator refers to “this blog” or “this article,” pass its Dato itemId to blogAgent; an attached replacement image should be passed as blogAgent attachmentUrl. The agent may edit the Dato draft but cannot publish it.`;
  }

  const productId = /^\/app\/product-atlas\/([^/]+)$/.exec(pathname)?.[1];
  if (productId) {
    const product = await db.query.productTable.findFirst({
      where: and(
        eq(productTable.id, productId),
        eq(productTable.organizationId, options.organizationId),
        isNull(productTable.deletedAt),
      ),
      with: { brand: { columns: { id: true, name: true } } },
    });
    if (!product) return header;
    return `${header}\nThis is the Product Atlas page for “${product.name}” (productId: ${product.id}) for ${product.brand.name} (brandId: ${product.brand.id}). Call productAtlasRead action get before making claims about the product graph.`;
  }

  const storefrontId = /^\/app\/apps\/([^/]+)$/.exec(pathname)?.[1];
  if (storefrontId) {
    const storefront = await db.query.storefrontTable.findFirst({
      where: and(
        eq(storefrontTable.id, storefrontId),
        isNull(storefrontTable.deletedAt),
      ),
      with: {
        product: {
          columns: { id: true, name: true, organizationId: true },
          with: { brand: { columns: { id: true, name: true } } },
        },
      },
    });
    if (storefront?.product.organizationId !== options.organizationId)
      return header;
    return `${header}\nThis is the ${storefront.surface.replaceAll("_", " ")} storefront for “${storefront.product.name}” (storefrontId: ${storefront.id}, productId: ${storefront.product.id}) for ${storefront.product.brand.name} (brandId: ${storefront.product.brand.id}). Call storefrontRead action get before making claims about its content, freshness, or references.`;
  }

  const guidance = guidanceForPath(pathname);
  return guidance ? `${header}\n${guidance}` : header;
}
