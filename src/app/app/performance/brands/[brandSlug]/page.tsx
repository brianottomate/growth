import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ExternalLink } from "lucide-react";

import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  memberTable,
  performanceAccountTable,
  performanceIntakeTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { BrandBrandingCard } from "@/app/app/brands/[brandSlug]/BrandBrandingCard";
import { cn } from "@/components/ui/lib/utils";
import { listBrandAdPreviews } from "@/server/services/brand-ad-previews.service";
import { loadBrandContacts } from "@/server/services/brand-contacts.service";
import { listMedia } from "@/server/services/media.service";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";
import { brandListings } from "@/server/services/wanderos-listings.service";

import { brandAdsHref, BrandLogo, CampaignRow, panel, SectionLabel } from "../../_components";
import { StageChip } from "../../StageChip";
import { StartCampaignInChat } from "../../StartCampaignInChat";
import {
  homeCatalogCopy,
  homeCatalogPreviewUrl,
  homePreviewRecipes,
  homePreviewUrl,
} from "@/lib/home-ad-previews";

import { AdPreviewsSection } from "./AdPreviewsSection";
import { HomesStrip } from "./HomesStrip";
import { MediaStrip } from "./MediaStrip";

export const metadata: Metadata = { title: "Brand · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The simple brand page for the Performance desk: what the site told us about
 * the brand, the homes on their WanderOS site, and what is in their library.
 * The full brand page keeps everything else.
 */
export default async function PerformanceBrandPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      website: true,
      leadDomain: true,
      featuredListingUrl: true,
      previewSourceUrl: true,
      relationship: true,
      brandIdentity: true,
      brandMark: true,
      connectTokenIssuedByName: true,
      connectTokenIssuedByEmail: true,
    },
  });
  if (!brand) notFound();

  const [homes, media, desk, account, adPreviews, people] = await Promise.all([
    brandListings({ id: brand.id, website: brand.website }),
    listMedia({ brandId: brand.id, kind: "image" }),
    loadPerformanceDesk(org.id),
    db.query.performanceAccountTable.findFirst({
      where: and(eq(performanceAccountTable.brandId, brand.id), isNull(performanceAccountTable.deletedAt)),
      columns: { id: true, contactName: true, contactEmail: true },
    }),
    listBrandAdPreviews(brand.id),
    loadBrandContacts({ leadDomain: brand.leadDomain, website: brand.website }),
  ]);
  const deskBrand = desk.brands.find((row) => row.id === brand.id) ?? null;
  const intake = account
    ? await db.query.performanceIntakeTable.findFirst({
        where: eq(performanceIntakeTable.accountId, account.id),
        orderBy: (t, { desc }) => desc(t.submittedAt),
        columns: { submittedByName: true, submittedByEmail: true, answers: true },
      })
    : null;
  const answers = intake?.answers ?? null;
  const contacts = [
    account?.contactName || account?.contactEmail
      ? { role: "Client contact", name: account.contactName, email: account.contactEmail }
      : null,
    intake?.submittedByName || intake?.submittedByEmail
      ? { role: "Filed the intake", name: intake.submittedByName, email: intake.submittedByEmail }
      : null,
    answers?.reportEmails ? { role: "Reports to", name: null, email: answers.reportEmails } : null,
    answers?.invoiceEmail ? { role: "Invoices to", name: null, email: answers.invoiceEmail } : null,
    brand.connectTokenIssuedByName || brand.connectTokenIssuedByEmail
      ? { role: "Wander rep", name: brand.connectTokenIssuedByName, email: brand.connectTokenIssuedByEmail }
      : null,
  ].filter((row): row is { role: string; name: string | null; email: string | null } => row !== null);
  type CardMeta = { composition?: { directedFrom?: string | null } };
  const isCard = (asset: (typeof media)[number]) =>
    Boolean((asset.metadata as CardMeta | null)?.composition);
  // When the art director re-cut a card, the homes run kept the first render
  // and pointed the corrected one back at it. The first is superseded: it is
  // not what any ad shows, and beside its replacement it reads as a double.
  const superseded = new Set(
    media.flatMap((asset) => {
      const from = (asset.metadata as CardMeta | null)?.composition?.directedFrom;
      return from ? [from] : [];
    }),
  );
  const shown = media.filter(
    (asset) =>
      asset.status === "ready" &&
      (asset.thumbnailUrl ?? asset.url) &&
      // The brand mark's own renders live in the library too; they are not
      // photos of anything and read as noise in a strip.
      (asset.metadata as { source?: string } | null)?.source !== "brand_mark" &&
      !superseded.has(asset.id),
  );
  const images = shown.slice(0, 18);
  // The mark's variants are library asset ids, not URLs; the feed mock wants
  // a URL. The traced vector draws sharpest, the colour PNG is the fallback,
  // and a brand with no mark shows its logo.
  const avatarUrl = brand.brandMark
    ? brand.brandMark.vector?.color
      ? `data:image/svg+xml;base64,${Buffer.from(brand.brandMark.vector.color).toString("base64")}`
      : ((
          await db.query.mediaAssetTable.findFirst({
            where: eq(mediaAssetTable.id, brand.brandMark.variants.color),
            columns: { url: true },
          })
        )?.url ?? brand.logo)
    : brand.logo;
  const withPhoto = homes.filter((home) => home.imageUrl);
  // Until a card is frozen, the previews section draws ONE of their homes on
  // the awareness card in each placement's own canvas, so the headline and
  // the button survive the feed's crop. Nothing is saved.
  const picked = brand.featuredListingUrl
    ? (withPhoto.find((home) => home.url === brand.featuredListingUrl) ?? null)
    : null;
  const featured = picked ?? withPhoto[0] ?? null;
  // The photo: an explicit choice (a home's hero or a library image), else the
  // featured home's own hero.
  const sourceUrl = brand.previewSourceUrl ?? featured?.imageUrl ?? null;
  const sourceImage = brand.previewSourceUrl
    ? (images.find((asset) => asset.url === brand.previewSourceUrl) ?? null)
    : null;
  const sourceHome = brand.previewSourceUrl
    ? (withPhoto.find((home) => home.imageUrl === brand.previewSourceUrl) ?? null)
    : featured;
  const pickerCurrent = {
    sourceUrl: brand.previewSourceUrl,
    label: sourceHome
      ? sourceHome.name
      : sourceImage
        ? (sourceImage.title ?? "Library image")
        : featured
          ? `${featured.name} (first on their site)`
          : "Choose a photo",
    thumbUrl: sourceHome?.thumbUrl ?? sourceHome?.imageUrl ?? sourceImage?.thumbnailUrl ?? sourceImage?.url ?? null,
  };
  const onDemandPreview = featured && sourceUrl
    ? (() => {
        const recipe = homePreviewRecipes(featured)[0]!;
        const catalog = homeCatalogCopy(featured);
        const source = { url: sourceUrl };
        const url = (formatId: "landscape" | "square" | "story") =>
          homePreviewUrl({ brandId: brand.id, source, formatId, recipe });
        const catalogUrl = (formatId: "landscape" | "square" | "story") =>
          homeCatalogPreviewUrl({ brandId: brand.id, source, formatId, copy: catalog });
        return {
          homeId: featured.id,
          homeName: featured.name,
          homeUrl: featured.url,
          imageUrl: featured.imageUrl!,
          headline: recipe.title,
          cta: recipe.cta,
          /** False while the page is falling back to the first home on their feed. */
          picked: picked !== null,
          previews: { facebook: url("landscape"), instagram: url("square"), story: url("story") },
          catalog,
          catalogPreviews: {
            facebook: catalogUrl("landscape"),
            instagram: catalogUrl("square"),
            story: catalogUrl("story"),
          },
        };
      })()
    : null;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{brand.name}</h2>
            {deskBrand ? <StageChip stage={deskBrand.stage} /> : null}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
            {brand.website ? (
              <a href={brand.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {brand.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            <Link href={`/app/brands/${brand.slug ?? brand.id}`} className="hover:underline">
              Full brand page
            </Link>
            <Link href={`/app/brands/${brand.slug ?? brand.id}/ads`} className="hover:underline">
              Campaigns
            </Link>
          </div>
        </div>
      </div>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Media library{shown.length ? ` · ${shown.length}` : ""}</SectionLabel>
          <div className="flex items-center gap-3 text-[11.5px]">
            <Link href={`/app/compositions?brandId=${encodeURIComponent(brand.id)}`} className="text-sky-300 hover:underline">
              Studio
            </Link>
            <Link href={`/app/media?brand=${encodeURIComponent(brand.slug ?? brand.id)}`} className="text-sky-300 hover:underline">
              Open library
            </Link>
          </div>
        </div>
        {images.length === 0 ? (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>Nothing in the library yet.</p>
        ) : (
          <MediaStrip
            images={images.map((asset) => ({
              id: asset.id,
              url: asset.url!,
              thumbnailUrl: asset.thumbnailUrl ?? null,
              title: asset.title ?? asset.filename ?? null,
              alt: asset.alt ?? null,
              width: asset.width ?? null,
              height: asset.height ?? null,
              isCard: isCard(asset),
            }))}
            brandId={brand.id}
            brandSlug={brand.slug}
          />
        )}
      </section>

      <AdPreviewsSection
        brandId={brand.id}
        brandSlug={brand.slug ?? brand.id}
        brandName={brand.name}
        brandLogo={avatarUrl}
        website={brand.website}
        cards={adPreviews}
        onDemand={onDemandPreview}
        picker={{
          homes: withPhoto.slice(0, 48).map((home) => ({
            url: home.url,
            name: home.name,
            imageUrl: home.imageUrl!,
            thumbUrl: home.thumbUrl ?? null,
          })),
          images: shown.slice(0, 48).map((asset) => ({
            id: asset.id,
            url: asset.url,
            thumbnailUrl: asset.thumbnailUrl ?? null,
            title: asset.title ?? null,
          })),
          current: pickerCurrent,
        }}
      />

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Campaigns{deskBrand?.campaigns.length ? ` · ${deskBrand.campaigns.length}` : ""}</SectionLabel>
          {deskBrand?.campaigns.length === 0 ? (
            <StartCampaignInChat brandId={brand.id} brandName={brand.name} />
          ) : (
            <Link href={brandAdsHref(brand)} className="text-[11.5px] text-sky-300 hover:underline">
              New campaign
            </Link>
          )}
        </div>
        {deskBrand && deskBrand.campaigns.length > 0 ? (
          <ul className={cn(panel, "divide-y")}>
            {deskBrand.campaigns.map((campaign) => (
              <CampaignRow key={campaign.id} brand={deskBrand} campaign={campaign} deletable />
            ))}
          </ul>
        ) : (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>No campaign yet.</p>
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Homes{withPhoto.length ? ` · ${homes.length}` : ""}</SectionLabel>
          {brand.website ? (
            <a href={brand.website} target="_blank" rel="noreferrer" className="text-[11.5px] text-sky-300 hover:underline">
              Their site
            </a>
          ) : null}
        </div>
        {homes.length === 0 ? (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>
            {brand.website ? "Not a WanderOS site, so there is no listing feed to read." : "No website on record."}
          </p>
        ) : (
          <HomesStrip
            homes={withPhoto.slice(0, 12).map((home) => ({
              id: home.id,
              name: home.name,
              url: home.url,
              imageUrl: home.imageUrl!,
              thumbUrl: home.thumbUrl ?? null,
              city: home.city ?? null,
              state: home.state ?? null,
              bedrooms: home.bedrooms ?? null,
              bathrooms: home.bathrooms ?? null,
              guests: home.guests ?? null,
              facts: [
                home.bedrooms ? `${home.bedrooms} bd` : null,
                home.guests ? `${home.guests} guests` : null,
                [home.city, home.state].filter(Boolean).join(", ") || null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
            brandId={brand.id}
            brandSlug={brand.slug}
            featuredUrl={brand.featuredListingUrl}
          />
        )}
        {withPhoto.length > 12 ? (
          <p className="text-muted-foreground text-[11px]">{withPhoto.length - 12} more on their site.</p>
        ) : null}
      </section>

      <BrandBrandingCard
        brandId={brand.id}
        logo={brand.logo}
        identity={brand.brandIdentity ?? null}
        website={brand.website}
      />

      <section className="space-y-2.5">
        <SectionLabel>Contacts</SectionLabel>
        {contacts.length === 0 ? (
          <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>No contacts on record.</p>
        ) : (
          <ul className={cn(panel, "divide-y")}>
            {contacts.map((contact) => (
              <li key={`${contact.role}-${contact.email ?? contact.name}`} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">{contact.role}</span>
                {contact.name ? <span className="font-semibold">{contact.name}</span> : null}
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="text-muted-foreground hover:underline">
                    {contact.email}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {people ? (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <SectionLabel>
              CRM contacts{people.contacts.length ? ` · ${people.contacts.length + people.moreCount}` : ""}
            </SectionLabel>
            {people.company ? (
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                {people.company.leadStatus ? <span>{people.company.leadStatus}</span> : null}
                {people.company.owner ? <span>Owner {people.company.owner}</span> : null}
                {people.company.isCustomer ? <span>Customer</span> : people.company.hasDeal ? <span>Deal open</span> : null}
                {people.company.pms ? (
                  <span>
                    {people.company.pms}
                    {people.company.unitCount ? ` · ${people.company.unitCount} units` : ""}
                  </span>
                ) : null}
                {people.company.hubspotUrl ? (
                  <a
                    href={people.company.hubspotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    HubSpot
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {people.contacts.length === 0 ? (
            <p className={cn(panel, "text-muted-foreground px-4 py-6 text-center text-xs")}>
              No contacts on file for {people.domain}.
            </p>
          ) : (
            <ul className={cn(panel, "divide-y")}>
              {people.contacts.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* A nameless contact is shown by email once, on the right. */}
                      <span className={person.name ? "font-medium" : "text-muted-foreground"}>
                        {person.name ?? "No name on file"}
                      </span>
                      {person.jobTitle ? <span className="text-muted-foreground text-xs">{person.jobTitle}</span> : null}
                      {person.optedOut ? (
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                          Opted out
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <a href={`mailto:${person.email}`} className="text-muted-foreground text-xs hover:underline">
                    {person.email}
                  </a>
                  {person.phone ? (
                    <a href={`tel:${person.phone}`} className="text-muted-foreground text-xs hover:underline">
                      {person.phone}
                    </a>
                  ) : null}
                </li>
              ))}
              {people.moreCount > 0 ? (
                <li className="text-muted-foreground px-4 py-2 text-xs">
                  {people.moreCount} more in HubSpot
                </li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
