"use client";
import type { PersonaProfile } from "@/lib/brand-direction";
import { DirectionPhrases } from "./CreativeDirection";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import { ShapeBrandButton } from "./ShapeBrandButton";
import type { PersonaDemandGeography } from "@/server/db/brand-schema";

type Persona = {
  id: string;
  name: string;
  description: string | null;
  profile?: PersonaProfile | null;
  demandGeography: PersonaDemandGeography | null;
  destinationGeography: PersonaDemandGeography | null;
};
function located(geo: PersonaDemandGeography | null) {
  return Boolean(
    geo &&
    [geo.countries, geo.states, geo.regions, geo.cities].some(
      (values) => values?.length,
    ),
  );
}
export function PersonaAudiences({
  brand,
  personas,
}: {
  brand: { id: string; slug: string; name: string; story: string | null };
  personas: Persona[];
}) {
  const shape = (
    <ShapeBrandButton
      brandId={brand.id}
      brandName={brand.name}
      section="personas"
    />
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users className="size-4" />
          Personas · {personas.length}
        </h2>
        <div className="flex flex-wrap gap-2">{shape}</div>
      </div>
      {!personas.length && (
        <EmptyState
          compact
          icon={Users}
          title="Define who you’re speaking to"
          description="Shape your customer personas in chat."
          actions={shape}
        />
      )}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        {personas.map((persona) => (
          <article
            key={persona.id}
            id={`persona-${persona.id}`}
            className="scroll-mt-4 space-y-3 rounded-xl border bg-muted/40 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{persona.name}</h3>
                {!persona.profile && (
                  <p className="text-sm text-muted-foreground">
                    {persona.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <ShapeBrandButton
                  brandId={brand.id}
                  brandName={brand.name}
                  section="persona"
                  resource={{ id: persona.id, name: persona.name }}
                />
              </div>
            </div>
            {persona.profile && (
              <PersonaProfileDetails profile={persona.profile} />
            )}
            {located(persona.demandGeography) && (
              <PersonaLocation
                persona={persona}
                geography={persona.demandGeography!}
                title="Where they live / travel from"
              />
            )}
            {located(persona.destinationGeography) && (
              <PersonaLocation
                persona={persona}
                geography={persona.destinationGeography!}
                title="Destinations of interest"
              />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
function PersonaLocation({
  persona,
  geography,
  title,
}: {
  persona: Persona;
  geography: PersonaDemandGeography;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium">{title}</h4>
      <GeographyChips label="Countries" values={geography.countries} />
      <GeographyChips label="States" values={geography.states} />
      <GeographyChips label="Regions" values={geography.regions} />
      <GeographyChips label="Cities" values={geography.cities} />
      {geography.source && (
        <p className="text-xs text-muted-foreground">{geography.source}</p>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-medium">
          View geography map
        </summary>
        <div className="mt-2">
          <AudienceMap
            audiences={[{ id: persona.id, name: persona.name, geography }]}
            context="persona"
          />
        </div>
      </details>
    </section>
  );
}
function PersonaProfileDetails({ profile }: { profile: PersonaProfile }) {
  const travel = profile.travel;
  const rows = travel
    ? [
        ["Trip purpose", travel.purpose],
        [
          "Party size",
          travel.partyMin && travel.partyMax
            ? `${travel.partyMin}–${travel.partyMax} guests`
            : null,
        ],
        ["Booking window", travel.bookingWindow],
        ["Stay length", travel.stayLength],
        ["Price sensitivity", travel.priceSensitivity],
      ]
    : [];
  return (
    <div className="space-y-4">
      <p className="text-sm">{profile.motivation}</p>
      {rows.some(([, value]) => value) && (
        <dl className="divide-y rounded-xl border px-3">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 py-2 text-sm"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
        </dl>
      )}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <DirectionPhrases title="Needs" values={profile.needs.slice(0, 3)} />
        <DirectionPhrases
          title="Decision criteria"
          values={profile.decisionCriteria.slice(0, 3)}
        />
      </div>
    </div>
  );
}
