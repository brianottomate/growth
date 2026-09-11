/**
 * Seeds the WanderOS product and its Product Atlas.
 *
 * WanderOS is a separate PRODUCT from Wander (guests book; operators run a
 * business) but deliberately sits on the SAME brand. `product.brandId` is
 * notNull with onDelete cascade, and it only gates which Media Library and
 * Website pages the product may reference — it is not a claim about who
 * markets it. Hanging WanderOS off a WanderOS brand row would mean deleting
 * that brand silently deletes the product, its storefronts and its launches.
 * If WanderOS ever becomes its own brand, this is one column on one row.
 *
 * Atlas content is read from wandercom/app.wander.com route definitions
 * (AppRoutes / SettingsRoutes / SiteEditorRoutes), so the views correspond to
 * real screens rather than invented ones.
 *
 *   bun --conditions=react-server scripts/seed-wanderos-product.ts --organization wander
 */
import { and, eq, isNull } from "drizzle-orm";

import { productAtlasSchema, type ProductAtlas } from "../src/lib/product-atlas";
import { db } from "../src/server/db";
import {
  brandTable,
  organizationTable,
  productTable,
} from "../src/server/db/schema";
import {
  createProduct,
  updateProduct,
  type ProductStorefrontActor,
} from "../src/server/services/product-storefront.service";

const organizationSlug =
  process.argv[process.argv.indexOf("--organization") + 1];
if (!organizationSlug || organizationSlug.startsWith("--")) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/seed-wanderos-product.ts --organization <organization-slug>",
  );
}

const organization = await db.query.organizationTable.findFirst({
  where: and(
    eq(organizationTable.slug, organizationSlug),
    isNull(organizationTable.deletedAt),
  ),
});
if (!organization) throw new Error(`Organization not found: ${organizationSlug}`);

// Same brand as the Wander product, on purpose — see the note at the top.
const brand = await db.query.brandTable.findFirst({
  where: and(
    eq(brandTable.organizationId, organization.id),
    eq(brandTable.slug, "wander"),
    isNull(brandTable.deletedAt),
  ),
});
if (!brand) throw new Error("Brand not found: wander");

const REPO = "https://github.com/wandercom/app.wander.com";
const DASH = "/dash/:organizationSlug";

const atlas: ProductAtlas = productAtlasSchema.parse({
  jobs: [
    {
      id: "job_fill_calendar",
      name: "Fill the calendar with direct bookings",
      description:
        "Get every listing bookable, be findable, and turn demand into reservations that do not pay an OTA commission.",
    },
    {
      id: "job_run_the_money",
      name: "Get paid and understand the money",
      description:
        "Collect what the stay and its extras are worth, pay out on time, and see what the portfolio earned.",
    },
    {
      id: "job_run_own_site",
      name: "Run a direct-booking website",
      description:
        "Publish and edit an operator-branded site on their own domain without a web team.",
    },
    {
      id: "job_care_for_guests",
      name: "Look after guests around the stay",
      description:
        "Know who is arriving, answer them, and reach the whole book of guests when something changes.",
    },
    {
      id: "job_keep_in_sync",
      name: "Keep listings and systems in sync",
      description:
        "Mirror the PMS as the system of record and give the team the right access.",
    },
  ],
  stories: [
    // Demand
    { id: "story_listing_readiness", jobId: "job_fill_calendar", name: "Get every listing ready to book" },
    { id: "story_availability", jobId: "job_fill_calendar", name: "See and manage availability" },
    { id: "story_discovery_agent", jobId: "job_fill_calendar", name: "Be found by search and AI assistants", description: "Discovery Agent." },
    { id: "story_channels", jobId: "job_fill_calendar", name: "Distribute listings to external channels", description: "Includes Google Vacation Rentals." },
    { id: "story_campaigns", jobId: "job_fill_calendar", name: "Run marketing campaigns to past guests" },
    // Money
    { id: "story_earnings", jobId: "job_run_the_money", name: "See what the portfolio earned" },
    { id: "story_custom_charges", jobId: "job_run_the_money", name: "Charge for extras beyond the stay", description: "Custom Charges: pets, tours, late checkout, spa." },
    { id: "story_payouts", jobId: "job_run_the_money", name: "Get paid out on a schedule" },
    { id: "story_discounts", jobId: "job_run_the_money", name: "Offer discounts without leaving money on the table" },
    { id: "story_capex", jobId: "job_run_the_money", name: "Track capital spend against a property" },
    // Own site
    { id: "story_site_editor", jobId: "job_run_own_site", name: "Build and edit the site" },
    { id: "story_site_domain", jobId: "job_run_own_site", name: "Publish on their own domain" },
    { id: "story_site_presentation", jobId: "job_run_own_site", name: "Control how stays and prices are presented" },
    // Guests
    { id: "story_reservations", jobId: "job_care_for_guests", name: "Work a reservation end to end" },
    { id: "story_guest_book", jobId: "job_care_for_guests", name: "Keep one record per guest" },
    { id: "story_announcements", jobId: "job_care_for_guests", name: "Announce something to the whole guest book" },
    // Sync
    { id: "story_pms_sync", jobId: "job_keep_in_sync", name: "Mirror the PMS as system of record" },
    { id: "story_team_access", jobId: "job_keep_in_sync", name: "Give the team the right access" },
  ],
  surfaces: [
    { id: "surface_dashboard", kind: "web", name: "WanderOS operator dashboard" },
    { id: "surface_operator_site", kind: "web", name: "Operator direct-booking website" },
    { id: "surface_pms", kind: "api", name: "PMS integrations" },
  ],
  views: [
    { id: "view_home", surfaceId: "surface_dashboard", name: "Home", reference: { kind: "route", value: `${DASH}/app/home` } },
    { id: "view_action_required", surfaceId: "surface_dashboard", name: "Action required", reference: { kind: "route", value: `${DASH}/app/action-required` } },
    { id: "view_calendar", surfaceId: "surface_dashboard", name: "Calendar", reference: { kind: "route", value: `${DASH}/app/calendar` } },
    { id: "view_reservations", surfaceId: "surface_dashboard", name: "Reservations", reference: { kind: "route", value: `${DASH}/app/reservations` } },
    { id: "view_guests", surfaceId: "surface_dashboard", name: "Guests", reference: { kind: "route", value: `${DASH}/app/guests` } },
    { id: "view_listings", surfaceId: "surface_dashboard", name: "Listings", reference: { kind: "route", value: `${DASH}/app/listings` } },
    { id: "view_finance_earnings", surfaceId: "surface_dashboard", name: "Earnings", reference: { kind: "route", value: `${DASH}/app/finance/earnings` } },
    { id: "view_finance_charges", surfaceId: "surface_dashboard", name: "Charges", reference: { kind: "route", value: `${DASH}/app/finance/charges` } },
    { id: "view_finance_create_charge", surfaceId: "surface_dashboard", name: "Create charge", reference: { kind: "route", value: `${DASH}/app/finance/charges/create` } },
    { id: "view_finance_payouts", surfaceId: "surface_dashboard", name: "Payouts", reference: { kind: "route", value: `${DASH}/app/finance/payouts` } },
    { id: "view_finance_discounts", surfaceId: "surface_dashboard", name: "Discounts", reference: { kind: "route", value: `${DASH}/app/finance/discounts` } },
    { id: "view_finance_capex", surfaceId: "surface_dashboard", name: "Capex", reference: { kind: "route", value: `${DASH}/app/finance/capex` } },
    { id: "view_marketing_campaigns", surfaceId: "surface_dashboard", name: "Campaigns", reference: { kind: "route", value: `${DASH}/app/marketing/campaigns` } },
    { id: "view_announcements", surfaceId: "surface_dashboard", name: "Announcements", reference: { kind: "route", value: `${DASH}/app/marketing/announcements` } },
    { id: "view_discoverability", surfaceId: "surface_dashboard", name: "Discovery Agent", reference: { kind: "route", value: `${DASH}/app/discoverability` } },
    { id: "view_site_editor", surfaceId: "surface_dashboard", name: "Site Editor", reference: { kind: "route", value: `${DASH}/app/site-editor` } },
    { id: "view_website_settings", surfaceId: "surface_dashboard", name: "Website settings", reference: { kind: "route", value: `${DASH}/app/website` } },
    { id: "view_pms_sync", surfaceId: "surface_dashboard", name: "PMS sync", reference: { kind: "route", value: `${DASH}/settings/pms-sync` } },
    { id: "view_team", surfaceId: "surface_dashboard", name: "Team", reference: { kind: "route", value: `${DASH}/settings/team` } },
    { id: "view_site_domain", surfaceId: "surface_dashboard", name: "Domain", reference: { kind: "route", value: `${DASH}/settings/domain` } },
    { id: "view_public_site", surfaceId: "surface_operator_site", name: "Published operator site", reference: { kind: "other", value: "WanderOS-built site on the operator's domain" } },
  ],
  storyViewLinks: [
    { id: "svl_readiness", storyId: "story_listing_readiness", viewId: "view_action_required" },
    { id: "svl_listings", storyId: "story_listing_readiness", viewId: "view_listings" },
    { id: "svl_availability", storyId: "story_availability", viewId: "view_calendar" },
    { id: "svl_discovery", storyId: "story_discovery_agent", viewId: "view_discoverability" },
    { id: "svl_campaigns", storyId: "story_campaigns", viewId: "view_marketing_campaigns" },
    { id: "svl_earnings", storyId: "story_earnings", viewId: "view_finance_earnings" },
    { id: "svl_charges", storyId: "story_custom_charges", viewId: "view_finance_charges" },
    { id: "svl_charges_create", storyId: "story_custom_charges", viewId: "view_finance_create_charge" },
    { id: "svl_payouts", storyId: "story_payouts", viewId: "view_finance_payouts" },
    { id: "svl_discounts", storyId: "story_discounts", viewId: "view_finance_discounts" },
    { id: "svl_capex", storyId: "story_capex", viewId: "view_finance_capex" },
    { id: "svl_site_editor", storyId: "story_site_editor", viewId: "view_site_editor" },
    { id: "svl_site_domain", storyId: "story_site_domain", viewId: "view_site_domain" },
    { id: "svl_site_presentation", storyId: "story_site_presentation", viewId: "view_website_settings" },
    { id: "svl_reservations", storyId: "story_reservations", viewId: "view_reservations" },
    { id: "svl_guest_book", storyId: "story_guest_book", viewId: "view_guests" },
    { id: "svl_announcements", storyId: "story_announcements", viewId: "view_announcements" },
    { id: "svl_pms", storyId: "story_pms_sync", viewId: "view_pms_sync" },
    { id: "svl_team", storyId: "story_team_access", viewId: "view_team" },
  ],
  journeys: [
    {
      id: "journey_operator_month",
      jobId: "job_fill_calendar",
      name: "Take a property from onboarded to booked",
      steps: [
        { id: "step_ready", name: "Get ready", order: 0, storyIds: ["story_listing_readiness", "story_pms_sync"] },
        { id: "step_found", name: "Get found", order: 1, storyIds: ["story_discovery_agent", "story_channels", "story_site_editor"] },
        { id: "step_booked", name: "Get booked", order: 2, storyIds: ["story_availability", "story_reservations"] },
        { id: "step_paid", name: "Get paid", order: 3, storyIds: ["story_custom_charges", "story_earnings", "story_payouts"] },
      ],
    },
  ],
  implementationRefs: [
    { id: "ref_dash_repo", targetType: "surface", targetId: "surface_dashboard", kind: "repository", label: "wandercom/app.wander.com", href: REPO },
    { id: "ref_routes", targetType: "surface", targetId: "surface_dashboard", kind: "document", label: "AppRoutes / SettingsRoutes / SiteEditorRoutes", href: `${REPO}/blob/main/src/navigation/routes/DashboardRoutes/AppRoutes.tsx` },
  ],
  observations: [
    {
      id: "obs_routes_read",
      targetType: "product",
      targetId: "wanderos",
      state: "found_in_code",
      note: "Jobs, stories and views derived from the dashboard route definitions in app.wander.com; not yet confirmed with the product team.",
      sourceUrl: REPO,
      observedAt: new Date().toISOString(),
    },
  ],
} satisfies ProductAtlas);

const actor: ProductStorefrontActor = {
  orgId: organization.id,
  userId: null,
  kind: "seed",
};

const existing = await db.query.productTable.findFirst({
  where: and(
    eq(productTable.organizationId, organization.id),
    eq(productTable.slug, "wanderos"),
    isNull(productTable.deletedAt),
  ),
});

if (existing) {
  await updateProduct(actor, { productId: existing.id, atlas });
  console.log(`Updated WanderOS atlas (${existing.id}).`);
} else {
  const created = await createProduct(actor, {
    brandId: brand.id,
    name: "WanderOS",
    slug: "wanderos",
    description:
      "The operator platform: list, get found, take direct bookings, get paid, and run an owned website.",
    atlas,
  });
  console.log(`Created WanderOS (${created.id}) on brand ${brand.name}.`);
}

console.log(
  `${atlas.jobs.length} jobs, ${atlas.stories.length} features, ${atlas.surfaces.length} surfaces, ${atlas.views.length} views.`,
);
