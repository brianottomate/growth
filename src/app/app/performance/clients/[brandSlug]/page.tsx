import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ExternalLink, Users, ContactRound, Images } from "lucide-react";

import { db } from "@/server/db";
import {
  performanceAccountTable,
  performanceIntakeTable,
} from "@/server/db/schema";
import { Button } from "@/components/ui/button";
import { loadBrandContacts } from "@/server/services/brand-contacts.service";
import { listMedia } from "@/server/services/media.service";
import {
  loadBrandReadiness,
  readinessLinks,
} from "@/server/services/performance-readiness.service";

import { ReadinessChecklist } from "../../ReadinessChecklist";
import { PerformanceClientCard } from "../../PerformanceClientCard";
import { performanceCardFromBrand } from "@/lib/performance-card";

import { MediaStrip } from "./MediaStrip";
import { SubmissionSection } from "./SubmissionSection";
import { brandAvatarUrl, loadPerformanceBrand } from "./_data";

export const metadata: Metadata = { title: "Brand · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The client's Overview: where they stand on the checklist, what they filed
 * on the intake, what is in their library, and who to talk to. Homes, ads and campaigns are the
 * other tabs.
 */
export default async function PerformanceBrandPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [media, account, people, avatarUrl, readiness] = await Promise.all([
    listMedia({ brandId: brand.id, kind: "image" }),
    db.query.performanceAccountTable.findFirst({
      where: and(
        eq(performanceAccountTable.brandId, brand.id),
        isNull(performanceAccountTable.deletedAt),
      ),
      columns: { id: true, contactName: true, contactEmail: true },
    }),
    loadBrandContacts({
      leadDomain: brand.leadDomain,
      website: brand.website,
    }),
    brandAvatarUrl(brand),
    deskBrand ? loadBrandReadiness([deskBrand]) : Promise.resolve(null),
  ]);
  const intake = account
    ? await db.query.performanceIntakeTable.findFirst({
        where: eq(performanceIntakeTable.accountId, account.id),
        orderBy: (t, { desc }) => desc(t.submittedAt),
        columns: {
          submittedByName: true,
          submittedByEmail: true,
          answers: true,
        },
      })
    : null;
  const answers = intake?.answers ?? null;
  const contacts = [
    account?.contactName || account?.contactEmail
      ? {
          role: "Client contact",
          name: account.contactName,
          email: account.contactEmail,
        }
      : null,
    intake?.submittedByName || intake?.submittedByEmail
      ? {
          role: "Filed the intake",
          name: intake.submittedByName,
          email: intake.submittedByEmail,
        }
      : null,
    answers?.reportEmails
      ? { role: "Reports to", name: null, email: answers.reportEmails }
      : null,
    answers?.invoiceEmail
      ? { role: "Invoices to", name: null, email: answers.invoiceEmail }
      : null,
    brand.connectTokenIssuedByName || brand.connectTokenIssuedByEmail
      ? {
          role: "Wander rep",
          name: brand.connectTokenIssuedByName,
          email: brand.connectTokenIssuedByEmail,
        }
      : null,
  ].filter(
    (row): row is { role: string; name: string | null; email: string | null } =>
      row !== null,
  );
  type CardMeta = { composition?: { directedFrom?: string | null } };
  const isCard = (asset: (typeof media)[number]) =>
    Boolean((asset.metadata as CardMeta | null)?.composition);
  // When the art director re-cut a card, the homes run kept the first render
  // and pointed the corrected one back at it. The first is superseded: it is
  // not what any ad shows, and beside its replacement it reads as a double.
  const superseded = new Set(
    media.flatMap((asset) => {
      const from = (asset.metadata as CardMeta | null)?.composition
        ?.directedFrom;
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
  const slug = brand.slug ?? brand.id;
  const brandReadiness = deskBrand
    ? (readiness?.get(deskBrand.id) ?? null)
    : null;

  return (
    <div className="space-y-4">
      {deskBrand && (
        <section className="space-y-2.5">
          <PerformanceClientCard
            card={performanceCardFromBrand(deskBrand)}
            context="client"
          />
        </section>
      )}
      {deskBrand && brandReadiness ? (
        <section className="rounded-xl border px-4">
          <ReadinessChecklist
            brandId={brand.id}
            revision={brandReadiness.revision}
            checklist={brandReadiness.checklist}
            links={readinessLinks(deskBrand)}
          />
        </section>
      ) : null}

      <SubmissionSection
        brand={brand}
        pitchUrl={deskBrand?.pitchUrl ?? null}
        intakeUrl={deskBrand?.intakeUrl ?? null}
      />

      <section
        aria-labelledby="contacts-heading"
        className="space-y-4 rounded-xl border p-4"
      >
        <div className="flex items-center gap-2">
          <Users aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="contacts-heading" className="text-base font-semibold">
            Contacts
          </h2>
        </div>
        {contacts.length === 0 ? (
          <div className="space-y-1 py-4">
            <p className="text-sm font-medium">No contacts on record.</p>
            <p className="text-xs text-muted-foreground">
              Client, reporting, and invoice contacts appear here when supplied.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {contacts.map((contact) => (
              <li
                key={`${contact.role}-${contact.email ?? contact.name}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-xs"
              >
                <span className="w-28 shrink-0 text-muted-foreground">
                  {contact.role}
                </span>
                {contact.name ? (
                  <span className="font-semibold">{contact.name}</span>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-muted-foreground hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {people ? (
        <section
          aria-labelledby="crm-contacts-heading"
          className="space-y-4 rounded-xl border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ContactRound
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h2 id="crm-contacts-heading" className="text-base font-semibold">
                CRM contacts
              </h2>
              {people.contacts.length ? (
                <span className="text-xs text-muted-foreground">
                  {people.contacts.length + people.moreCount}
                </span>
              ) : null}
            </div>
            {people.company ? (
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {people.company.leadStatus ? (
                  <span>{people.company.leadStatus}</span>
                ) : null}
                {people.company.owner ? (
                  <span>Owner {people.company.owner}</span>
                ) : null}
                {people.company.isCustomer ? (
                  <span>Customer</span>
                ) : people.company.hasDeal ? (
                  <span>Deal open</span>
                ) : null}
                {people.company.pms ? (
                  <span>
                    {people.company.pms}
                    {people.company.unitCount
                      ? ` · ${people.company.unitCount} units`
                      : ""}
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
            <p className="py-4 text-sm text-muted-foreground">
              No contacts on file for {people.domain}.
            </p>
          ) : (
            <ul className="divide-y">
              {people.contacts.map((person) => (
                <li
                  key={person.id}
                  className="flex min-w-0 flex-col items-start gap-x-4 gap-y-1 py-3 text-sm @lg:flex-row @lg:flex-wrap @lg:items-center"
                >
                  <div className="min-w-0 @lg:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* A nameless contact is shown by email once, on the right. */}
                      <span
                        className={
                          person.name ? "font-medium" : "text-muted-foreground"
                        }
                      >
                        {person.name ?? "No name on file"}
                      </span>
                      {person.jobTitle ? (
                        <span className="text-xs text-muted-foreground">
                          {person.jobTitle}
                        </span>
                      ) : null}
                      {person.optedOut ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Opted out
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <a
                    href={`mailto:${person.email}`}
                    className="text-xs [overflow-wrap:anywhere] text-muted-foreground hover:underline"
                  >
                    {person.email}
                  </a>
                  {person.phone ? (
                    <a
                      href={`tel:${person.phone}`}
                      className="text-xs [overflow-wrap:anywhere] text-muted-foreground hover:underline"
                    >
                      {person.phone}
                    </a>
                  ) : null}
                </li>
              ))}
              {people.moreCount > 0 ? (
                <li className="py-2 text-xs text-muted-foreground">
                  {people.moreCount} more in HubSpot
                </li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

      <section
        aria-labelledby="media-library-heading"
        className="space-y-4 rounded-xl border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Images
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <h2 id="media-library-heading" className="text-base font-semibold">
              Media library
            </h2>
            {shown.length ? (
              <span className="text-xs text-muted-foreground">
                {shown.length}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/app/compositions?brandId=${encodeURIComponent(brand.id)}`}
              >
                Studio
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/media?brand=${encodeURIComponent(slug)}`}>
                Open library
              </Link>
            </Button>
          </div>
        </div>
        {images.length === 0 ? (
          <div className="space-y-1 py-4">
            <p className="text-sm font-medium">Nothing in the library yet.</p>
            <p className="text-xs text-muted-foreground">
              Photos and saved creative previews appear here once added.
            </p>
          </div>
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
    </div>
  );
}
