import { and, eq, ilike, isNull } from "drizzle-orm";

import {
  productAtlasSchema,
  storefrontContentSchema,
  type ProductAtlas,
  type StorefrontContent,
  type StorefrontSurfaceId,
} from "../src/lib/product-atlas";
import { db } from "../src/server/db";
import {
  brandTable,
  organizationTable,
  productTable,
  storefrontTable,
} from "../src/server/db/schema";
import {
  createProduct,
  createStorefront,
  type ProductStorefrontActor,
} from "../src/server/services/product-storefront.service";

const organizationSlug =
  process.argv[process.argv.indexOf("--organization") + 1];
if (!organizationSlug || organizationSlug.startsWith("--")) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/seed-product-storefronts.ts --organization <organization-slug>",
  );
}

const organization = await db.query.organizationTable.findFirst({
  where: and(
    eq(organizationTable.slug, organizationSlug),
    isNull(organizationTable.deletedAt),
  ),
});
if (!organization) {
  throw new Error(`Organization not found: ${organizationSlug}`);
}

const actor: ProductStorefrontActor = {
  orgId: organization.id,
  userId: null,
  kind: "seed",
};

const wanderAtlas: ProductAtlas = productAtlasSchema.parse({
  jobs: [
    {
      id: "job_find_book_stay",
      name: "Find and book an exceptional stay",
      description:
        "Move from a destination idea to a confidently chosen Wander with live availability, clear fit, and a direct booking path.",
    },
  ],
  stories: [
    {
      id: "story_discover",
      jobId: "job_find_book_stay",
      name: "Find stays that fit the trip",
    },
    {
      id: "story_evaluate",
      jobId: "job_find_book_stay",
      name: "Understand the property before booking",
    },
    {
      id: "story_book",
      jobId: "job_find_book_stay",
      name: "Continue to booking without rebuilding the search",
    },
    {
      id: "story_manage",
      jobId: "job_find_book_stay",
      name: "Keep the booked stay and concierge close at hand",
    },
  ],
  journeys: [
    {
      id: "journey_guest_stay",
      jobId: "job_find_book_stay",
      name: "Choose and experience a Wander",
      steps: [
        {
          id: "step_discover",
          name: "Discover",
          order: 0,
          storyIds: ["story_discover"],
        },
        {
          id: "step_evaluate",
          name: "Evaluate",
          order: 1,
          storyIds: ["story_evaluate"],
        },
        {
          id: "step_book",
          name: "Book",
          order: 2,
          storyIds: ["story_book"],
        },
        {
          id: "step_manage",
          name: "Manage",
          order: 3,
          storyIds: ["story_manage"],
        },
      ],
    },
  ],
  surfaces: [
    { id: "surface_web", name: "Wander web marketplace", kind: "web" },
    { id: "surface_ios", name: "Wander iPhone app", kind: "ios" },
    {
      id: "surface_assistant",
      name: "ChatGPT and Claude MCP App",
      kind: "assistant",
    },
    { id: "surface_guest_api", name: "Public guest API", kind: "api" },
  ],
  views: [
    {
      id: "view_ios_search",
      surfaceId: "surface_ios",
      name: "Search and discovery",
      reference: { kind: "screen", value: "Wander mobile search" },
    },
    {
      id: "view_ios_property",
      surfaceId: "surface_ios",
      name: "Property details",
      reference: { kind: "screen", value: "Wander mobile property detail" },
    },
    {
      id: "view_ios_booking",
      surfaceId: "surface_ios",
      name: "Booking flow",
      reference: { kind: "screen", value: "Wander mobile booking" },
    },
    {
      id: "view_ios_trip",
      surfaceId: "surface_ios",
      name: "Trips and concierge",
      reference: { kind: "screen", value: "Wander mobile guest trip" },
    },
    {
      id: "view_assistant_search",
      surfaceId: "surface_assistant",
      name: "Interactive stay carousel",
      description:
        "Searches public inventory and renders responsive multi-image stay cards with dates, prices, ratings, and booking links.",
      reference: { kind: "tool", value: "search_listings" },
    },
    {
      id: "view_assistant_detail",
      surfaceId: "surface_assistant",
      name: "Listing detail answer",
      description:
        "Returns public property facts, amenities, nearby highlights, and optional day-level availability without exposing a street address.",
      reference: { kind: "tool", value: "get_listing_details" },
    },
    {
      id: "view_assistant_booking",
      surfaceId: "surface_assistant",
      name: "Direct booking handoff",
      description:
        "Opens Wander with the chosen property, dates, and guest count preserved.",
      reference: { kind: "conversation", value: "bookingUrl" },
    },
    {
      id: "view_guest_search_api",
      surfaceId: "surface_guest_api",
      name: "Guest search contract",
      reference: { kind: "route", value: "/guest-api/search" },
    },
    {
      id: "view_guest_listing_api",
      surfaceId: "surface_guest_api",
      name: "Guest listing contract",
      reference: { kind: "route", value: "/guest-api/listings/:id" },
    },
    {
      id: "view_web_property",
      surfaceId: "surface_web",
      name: "Public property page",
      reference: { kind: "route", value: "/property/:slug" },
    },
  ],
  storyViewLinks: [
    {
      id: "link_discover_ios",
      storyId: "story_discover",
      viewId: "view_ios_search",
    },
    {
      id: "link_discover_assistant",
      storyId: "story_discover",
      viewId: "view_assistant_search",
    },
    {
      id: "link_evaluate_ios",
      storyId: "story_evaluate",
      viewId: "view_ios_property",
    },
    {
      id: "link_evaluate_assistant",
      storyId: "story_evaluate",
      viewId: "view_assistant_detail",
    },
    {
      id: "link_book_ios",
      storyId: "story_book",
      viewId: "view_ios_booking",
    },
    {
      id: "link_book_assistant",
      storyId: "story_book",
      viewId: "view_assistant_booking",
    },
    {
      id: "link_manage_ios",
      storyId: "story_manage",
      viewId: "view_ios_trip",
    },
  ],
  implementationRefs: [
    {
      id: "ref_mobile_repo",
      targetType: "surface",
      targetId: "surface_ios",
      kind: "repository",
      label: "wandercom/mobile",
      href: "https://github.com/wandercom/mobile",
    },
    {
      id: "ref_mcp_repo",
      targetType: "surface",
      targetId: "surface_assistant",
      kind: "repository",
      label: "wandercom/wander-mcp",
      href: "https://github.com/wandercom/wander-mcp",
    },
    {
      id: "ref_mcp_endpoint",
      targetType: "surface",
      targetId: "surface_assistant",
      kind: "api",
      label: "Branded Wander MCP endpoint",
      href: "https://www.wander.com/mcp",
    },
    {
      id: "ref_mcp_worker",
      targetType: "surface",
      targetId: "surface_assistant",
      kind: "api",
      label: "Cloudflare Worker implementation endpoint",
      href: "https://wander-mcp.wndr.workers.dev/mcp",
    },
    {
      id: "ref_app_store",
      targetType: "surface",
      targetId: "surface_ios",
      kind: "other",
      label: "Public Apple App Store listing",
      href: "https://apps.apple.com/us/app/wa-nder/id1582777762",
    },
  ],
  observations: [
    {
      id: "obs_ios_public",
      targetType: "surface",
      targetId: "surface_ios",
      state: "observed_live",
      note: "The public App Store listing showed Wander 1.15.0, Travel, iPhone, developer Wander.com Inc, a 4.8 rating, and 1.2K ratings on 2026-07-21.",
      sourceUrl: "https://apps.apple.com/us/app/wa-nder/id1582777762",
      observedAt: "2026-07-21T20:00:00.000Z",
    },
    {
      id: "obs_ios_source",
      targetType: "surface",
      targetId: "surface_ios",
      state: "found_in_code",
      note: "The mobile repository identifies App Store Connect app 1582777762, bundle com.wander.com.app, version 1.15.0, and build 309.",
    },
    {
      id: "obs_mcp_claude_live",
      targetType: "surface",
      targetId: "surface_assistant",
      state: "observed_live",
      note: "The Worker initialized from the Claude origin and successfully returned live Lake Tahoe inventory through search_listings on 2026-07-21.",
      sourceUrl: "https://wander-mcp.wndr.workers.dev/mcp",
      observedAt: "2026-07-21T19:48:00.000Z",
    },
    {
      id: "obs_mcp_chatgpt_live",
      targetType: "surface",
      targetId: "surface_assistant",
      state: "observed_live",
      note: "The branded endpoint completed an MCP handshake and returned live Lake Tahoe inventory during the ChatGPT submission smoke on 2026-08-19.",
      sourceUrl: "https://www.wander.com/mcp",
      observedAt: "2026-08-19T16:21:27.000Z",
    },
    {
      id: "obs_mcp_branded_route",
      targetType: "surface",
      targetId: "surface_assistant",
      state: "observed_live",
      note: "www.wander.com/mcp is the canonical public route and proxies requests to the Cloudflare Worker implementation.",
      sourceUrl: "https://www.wander.com/mcp",
      observedAt: "2026-08-19T16:21:27.000Z",
    },
  ],
});

const appleContent: StorefrontContent = storefrontContentSchema.parse({
  positioning: {
    audience:
      "Guests discovering, booking, and managing exceptional vacation homes on iPhone.",
    valueProposition:
      "Find and book a high-quality vacation home, then keep trip details and Wander concierge in one app.",
    category: "Travel",
    keyMessages: [
      "Vacation homes, but better",
      "Curated homes with hotel-grade amenities",
      "Direct booking and trip management",
      "24/7 concierge service",
    ],
  },
  copy: {
    displayName: "Wander",
    shortDescription: "Vacation homes, but better",
    longDescription:
      "Find your happy place with a curated Wander vacation home. Browse inspiring properties, review amenities and availability, book your stay, and keep trip details and 24/7 concierge service close at hand.",
    tagline: "Find your happy place",
    keywords: [
      "vacation rentals",
      "vacation homes",
      "luxury travel",
      "getaways",
      "concierge",
    ],
    supportText:
      "Website: https://www.wander.com\nSupport: https://www.wander.com/contact\nPrivacy: https://www.wander.com/privacy",
    releaseNotes:
      "Version 1.15.0 includes bug fixes and performance improvements.",
  },
  iconMediaAssetId: null,
  screenshots: [],
  promotionalAssets: [],
  videos: [],
  platformFields: {
    appStoreId: "1582777762",
    developer: "Wander.com Inc",
    bundleId: "com.wander.com.app",
    marketingVersion: "1.15.0",
    sourceBuildNumber: "309",
    deviceSupport: "iPhone",
    minimumIosVersion: "16.4",
    ageRating: "4+",
    primaryLanguage: "English",
    publicRating: 4.8,
    publicRatingCount: "1.2K",
    publicCheckedAt: "2026-07-21",
  },
});

const assistantContent = (host: "ChatGPT" | "Claude"): StorefrontContent =>
  storefrontContentSchema.parse({
    positioning: {
      audience:
        host === "ChatGPT"
          ? "Travelers planning a trip in ChatGPT or Codex who want current Wander inventory."
          : "Travelers planning a vacation with Claude who want real Wander inventory and a direct booking path.",
      valueProposition:
        host === "ChatGPT"
          ? "Search Wander stays by destination and trip needs, inspect public details and availability, then open the selected stay on Wander."
          : "Search Wander stays, inspect live property details, and continue to direct booking without leaving the Claude planning conversation.",
      category: "Travel",
      keyMessages: [
        "Search public Wander inventory by destination, dates, guests, price, amenities, and property type",
        "Compare interactive stay cards with photos, prices, ratings, and availability",
        "Inspect public property details without exposing street addresses",
        "Continue to the property on Wander for booking and payment",
      ],
    },
    copy: {
      displayName: "Wander",
      shortDescription:
        host === "ChatGPT"
          ? "Find a Wander stay"
          : "Find exceptional vacation homes and continue to direct booking.",
      longDescription:
        host === "ChatGPT"
          ? "Search public Wander vacation rentals by destination, dates, guests, price, amenities, and property type. Compare matching stays, inspect public details, availability, and pricing, then open a selected property on Wander."
          : "Bring Wander into Claude to search vacation homes conversationally. Explore real inventory with photos, dates, prices, ratings, amenities, and availability, then open the selected Wander with trip context preserved. The first release is public and read-only; booking and payment continue securely on Wander.",
      tagline: "Find your happy place",
      keywords: [
        "vacation rentals",
        "travel planning",
        "vacation homes",
        host === "ChatGPT" ? "Wander stays" : "direct booking",
      ],
      supportText:
        "Website: https://www.wander.com\nSupport: https://www.wander.com/help\nPrivacy: https://www.wander.com/privacy\nTerms: https://www.wander.com/terms",
      releaseNotes:
        host === "ChatGPT"
          ? "Prepared for ChatGPT review with two public read-only tools, interactive search cards, explicit output schemas, and an external booking handoff."
          : "Initial public stay-shopping connector with interactive search cards and direct booking handoff.",
    },
    iconMediaAssetId: null,
    screenshots: [],
    promotionalAssets: [],
    videos: [],
    platformFields: {
      mcpEndpoint: "https://www.wander.com/mcp",
      implementationEndpoint: "https://wander-mcp.wndr.workers.dev/mcp",
      authentication: "none",
      runtimeTools: ["search_listings", "get_listing_details"],
      appResource: "ui://wander/search.html",
      checkout: "external_wander_booking",
      ...(host === "Claude"
        ? {
            proposedSkills: ["Stay Shopping", "Booking Handoff"],
            distributionAssumption:
              "The branded endpoint is live. Reverify the Claude directory requirements before submission.",
          }
        : {}),
      starterPrompts:
        host === "ChatGPT"
          ? [
              "Find Wander stays in Lake Tahoe next weekend for six guests. Show the strongest options with total price and bedrooms.",
              "Show me pet-friendly Wander stays around Scottsdale with a pool for no more than $800 per night.",
              "Find a Wander house for a flexible weekend in the next three months. I want at least three bedrooms, a hot tub, and mountain views.",
              "Using the Wander search results above, tell me more about the first stay, including its amenities, nearby activities, rating, and public location.",
              "Find Wander stays near San Diego for four guests next month, then inspect the best match and tell me which requested nights are available.",
            ]
          : [
              "Find a Wander near Lake Tahoe for four guests.",
              "Show me pet-friendly beach stays for a long weekend.",
              "Compare these Wander options and open the best booking page.",
            ],
      submissionState: host === "ChatGPT" ? "packet_prepared" : "not_started",
      publicCheckedAt: host === "ChatGPT" ? "2026-08-19" : "2026-07-21",
      ...(host === "ChatGPT"
        ? {
            category: "TRAVEL",
            toolAnnotations:
              "Both tools declare readOnlyHint=true, openWorldHint=false, destructiveHint=false, and idempotentHint=true.",
            outputSchemas: ["search_listings", "get_listing_details"],
            submissionSchemaVersion: "1",
            positiveTestCaseCount: "5",
            negativeTestCaseCount: "3",
            negativePrompts: [
              "Find the cheapest round-trip flight from New York to Paris next month.",
              "Search every vacation rental marketplace and compare all cabins in Aspen.",
              "Book the first Wander home, charge my card, and send the confirmation.",
            ],
            reviewGates: [
              "Deploy the revised tool metadata and rescan the production MCP endpoint.",
              "Confirm the privacy policy covers assistant query fields and retention.",
              "Complete OpenAI organization and domain verification.",
            ],
            currentArchitecture:
              "The branded Wander route proxies to the public Cloudflare Worker implementation.",
            distributionState:
              "The branded endpoint is live. The revised review contract and submission packet await repository publication and deployment.",
          }
        : {}),
    },
  });

const definitions: {
  surface: StorefrontSurfaceId;
  listingStatus: "live" | "draft";
  externalListingId?: string;
  publicUrl?: string;
  managementUrl?: string;
  content: StorefrontContent;
  freshness:
    | { state: "confirmed"; note: string }
    | { state: "stale"; note: string }
    | { state: "unknown" };
}[] = [
  {
    surface: "apple_app_store",
    listingStatus: "live",
    externalListingId: "1582777762",
    publicUrl: "https://apps.apple.com/us/app/wa-nder/id1582777762",
    managementUrl: "https://appstoreconnect.apple.com/apps/1582777762/appstore",
    content: appleContent,
    freshness: {
      state: "stale",
      note: "Public identity and version were checked on 2026-07-21, but the target copy, screenshots, keywords, support URL, and App Store Connect-only fields still need reconciliation.",
    },
  },
  {
    surface: "chatgpt_connector",
    listingStatus: "draft",
    publicUrl: "https://www.wander.com/mcp",
    content: assistantContent("ChatGPT"),
    freshness: {
      state: "stale",
      note: "Submission packet prepared; deploy the revised MCP contract and complete OpenAI review before marking current.",
    },
  },
  {
    surface: "claude_connector",
    listingStatus: "live",
    publicUrl: "https://www.wander.com/mcp",
    content: assistantContent("Claude"),
    freshness: { state: "unknown" },
  },
];

async function applyInitialFreshness(
  storefrontId: string,
  freshness: (typeof definitions)[number]["freshness"],
) {
  if (freshness.state === "unknown") return;
  const now = new Date();
  await db
    .update(storefrontTable)
    .set(
      freshness.state === "confirmed"
        ? {
            freshnessStatus: "up_to_date",
            staleNote: null,
            staleMarkedAt: null,
            confirmedAt: now,
          }
        : {
            freshnessStatus: "stale",
            staleNote: freshness.note,
            staleMarkedAt: now,
            confirmedAt: null,
          },
    )
    .where(eq(storefrontTable.id, storefrontId));
}

const brand = await db.query.brandTable.findFirst({
  where: and(
    eq(brandTable.organizationId, organization.id),
    ilike(brandTable.name, "Wander"),
    isNull(brandTable.deletedAt),
  ),
});
if (!brand) throw new Error("Wander brand not found in this organization");

let product = await db.query.productTable.findFirst({
  where: and(
    eq(productTable.organizationId, organization.id),
    eq(productTable.slug, "wander"),
    isNull(productTable.deletedAt),
  ),
});
let productsCreated = 0;
if (!product) {
  product = await createProduct(actor, {
    brandId: brand.id,
    name: "Wander",
    slug: "wander",
    description:
      "Discover, book, and manage exceptional vacation homes across web, mobile, and assistant surfaces.",
    atlas: wanderAtlas,
  });
  productsCreated++;
}

let storefrontsCreated = 0;
for (const definition of definitions) {
  const existing = await db.query.storefrontTable.findFirst({
    where: and(
      eq(storefrontTable.productId, product.id),
      eq(storefrontTable.surface, definition.surface),
      isNull(storefrontTable.deletedAt),
    ),
  });
  if (existing) {
    if (existing.freshnessStatus === "unknown") {
      await applyInitialFreshness(existing.id, definition.freshness);
    }
    continue;
  }

  const created = await createStorefront(actor, {
    productId: product.id,
    surface: definition.surface,
    externalListingId: definition.externalListingId ?? null,
    publicUrl: definition.publicUrl ?? null,
    managementUrl: definition.managementUrl ?? null,
    listingStatus: definition.listingStatus,
    content: definition.content,
  });
  await applyInitialFreshness(created.id, definition.freshness);
  storefrontsCreated++;
}

console.log({
  organization: organization.slug,
  product: product.slug,
  productsCreated,
  storefrontsCreated,
});
