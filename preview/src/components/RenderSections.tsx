import { CallToAction } from "@wandercom/website-registry/components/CallToAction";
import { FeatureImageCards } from "@wandercom/website-registry/components/Cards/FeatureImageCards";
import { Footer } from "@wandercom/website-registry/components/Footer";
import { HomepageHero } from "@wandercom/website-registry/components/HomepageHero/HomepageHero";
import { NavBar } from "@wandercom/website-registry/components/Navbar";
import { PropertyGallery } from "@wandercom/website-registry/components/PropertyGallery/PropertyGallery";

import type { PregenArtifact } from "../lib/artifact";

// Preview dispatch — the pregen-relevant slice of the sites app's RenderPage
// switch. Sections the homepage template can't produce are skipped; `reviews`
// is skipped in V0 (previews have no review data source). Property data comes
// from the artifact's extractedProperties, mapped to the SearchUnit shape the
// registry cards expect (prices in cents, rating doubled to the 0–10 scale,
// bookable: false) — same mapping the monolith's prospect-search override uses.

type Section = Record<string, unknown> & { type: string };

export function RenderSections({ artifact }: { artifact: PregenArtifact }) {
  const homepage =
    artifact.pages.find((p) => p.kind === "HOMEPAGE") ?? artifact.pages[0];
  if (!homepage) return null;

  const properties =
    artifact.searchUnits && artifact.searchUnits.length > 0
      ? (artifact.searchUnits as SearchUnitLike[])
      : artifact.extractedProperties.map((unit, index) => toSearchUnit(unit, index));

  const website = {
    title: artifact.config.title || artifact.prospect.name || artifact.prospect.domain,
    logoUrl: artifact.config.logoUrl ?? null,
    faviconUrl: artifact.config.faviconUrl ?? null,
  };

  return (
    <>
      <NavBar
        website={website}
        // Without an explicit logoIcon the mobile header renders no brand at
        // all (the text logo is desktop-only), which reads as an unfinished
        // site on the device most prospects open the email on.
        logoIcon={<span className="text-base font-semibold">{website.title}</span>}
        actionButton={
          <a
            href="#properties"
            className="bg-content-primary text-default rounded-full px-4 py-2 text-sm font-medium"
          >
            Browse homes
          </a>
        }
      />
      {(homepage.sections as Section[]).map((section, index) => (
        <RenderSection
          key={index}
          section={section}
          isFirst={index === 0}
          properties={properties}
        />
      ))}
      <Footer
        website={website}
        hasRentalAgreement={false}
        pagesLinks={[{ title: "Home", path: "/" }]}
      />
    </>
  );
}

function RenderSection({
  section,
  isFirst,
  properties,
}: {
  section: Section;
  isFirst: boolean;
  properties: SearchUnitLike[];
}) {
  const s = section as never;

  switch (section.type) {
    case "homepage-hero":
      return (
        <HomepageHero
          {...(s as object)}
          eager={isFirst}
          properties={
            section.showPropertyGallery ? (properties as never) : ([] as never)
          }
          // Vision picks bright daylight exteriors and aerials for the hero, so
          // the template's 35% scrim leaves the subtitle hard to read. 45 is the
          // next supported step.
          backgroundOpacity={45}
          pricingDisplayMode="SHOW_PRICING"
        />
      );
    case "property-gallery":
      return (
        <PropertyGallery
          {...(s as object)}
          id="properties"
          properties={properties as never}
          pricingDisplayMode="SHOW_PRICING"
        />
      );
    case "cards": {
      if (
        section.variant === "feature-image-cards-overlay" ||
        section.variant === "feature-image-cards" ||
        section.variant === "feature-image-cards-centered"
      ) {
        const layout =
          section.variant === "feature-image-cards-overlay"
            ? "overlay"
            : section.variant === "feature-image-cards-centered"
              ? "centered"
              : "stacked";
        return <FeatureImageCards {...(s as object)} layout={layout} />;
      }
      return null;
    }
    case "book-direct":
      // BookDirect postdates the published registry (0.2.1); restore on the
      // next @wandercom/website-registry release.
      return null;
    case "cta":
      return (
        <CallToAction
          {...(s as object)}
          variant={section.variant === "feature" ? "feature" : undefined}
        />
      );
    case "reviews":
      // V0: previews have no reviews source; skipped rather than faked.
      return null;
    default:
      return null;
  }
}

// ---- SearchUnit mapping (ported from the monolith prospect-search) ------

type SearchUnitLike = ReturnType<typeof toSearchUnit>;

function toSearchUnit(
  unit: PregenArtifact["extractedProperties"][number],
  index: number,
) {
  // Search prices are in CENTS (nightly dollars * 100) — the card divides by 100.
  const price =
    unit.pricePerNight != null ? Math.round(unit.pricePerNight * 100) : undefined;

  return {
    id: `pgn${index.toString(36)}unit`,
    name: unit.name,
    slug: slugify(unit.name),
    type: "OTHER" as const,
    bathrooms: unit.bathrooms ?? 1,
    bedrooms: unit.bedrooms ?? 1,
    occupancy: unit.occupancy ?? Math.max(2, (unit.bedrooms ?? 1) * 2),
    bookable: false,
    timezone: "UTC",
    squareFootage: 0,
    // overallRating is a 0-10 scale in search; the card renders it as /2 stars.
    overallRating:
      unit.overallRating != null ? Math.min(10, unit.overallRating * 2) : 0,
    totalReviews: unit.totalReviews ?? 0,
    address: {
      latitude: 0,
      longitude: 0,
      city: unit.city ?? "",
      state: "",
      country: "",
    },
    medias: unit.imageUrls.map((url) => ({
      lowResUrl: url,
      mediumResUrl: url,
      thumbHash: "",
      type: "ROOM" as const,
    })),
    ...(price != null
      ? {
          cheapestPrice: {
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 86_400_000),
            totalNights: 1,
            price,
            nightPrice: price,
            baseNightPrice: price,
          },
        }
      : {}),
  };
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
