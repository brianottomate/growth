import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loadPersonaAudiences } from "@/server/services/persona-audience.service";

import { loadPerformanceBrand } from "../_data";

import { PersonaAudiences } from "./PersonaAudiences";

export const metadata: Metadata = { title: "Audiences · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Who the client's ads are for: the brand's personas, each with the Meta
 * audience it is bought through. Campaign audiences derived from a persona
 * target that asset on push, so it is set up once here, not per campaign.
 */
export default async function PerformanceBrandAudiencesPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const { personas, unassigned } = await loadPersonaAudiences(brand.id);
  return (
    <PersonaAudiences
      brand={{ id: brand.id, slug: brand.slug ?? brand.id, name: brand.name }}
      personas={personas.map(({ persona, targets }) => ({
        id: persona.id,
        name: persona.name,
        description: persona.description,
        countries: persona.demandGeography?.countries ?? [],
        targets,
      }))}
      unassigned={unassigned}
    />
  );
}
