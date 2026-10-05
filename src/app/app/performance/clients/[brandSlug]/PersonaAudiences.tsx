"use client";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Sparkles, Users } from "lucide-react";
import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { ShapeBrandButton } from "./ShapeBrandButton";
import type { PersonaDemandGeography } from "@/server/db/brand-schema";

type Persona = {
  id: string;
  name: string;
  description: string | null;
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
  unassigned?: unknown[];
}) {
  const hasStory = Boolean(brand.story?.trim());
  const router = useRouter();
  const suggest = useMutation(orpc.persona.suggest.mutationOptions());
  const create = useMutation(orpc.persona.create.mutationOptions());
  const define = async () => {
    try {
      const result = await suggest.mutateAsync({ brandId: brand.id });
      for (const proposal of result.suggestions)
        await create.mutateAsync({ brandId: brand.id, ...proposal });
      router.refresh();
      if (!result.suggestions.length)
        toast.info("No additional personas suggested");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not define personas",
      );
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users className="size-4" />
          Personas · {personas.length}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasStory || suggest.isPending || create.isPending}
            onClick={() => void define()}
          >
            <Sparkles className="size-3.5" />
            Define personas
          </Button>
          <ShapeBrandButton
            brandId={brand.id}
            brandName={brand.name}
            section="personas"
          />
        </div>
      </div>
      {!personas.length && (
        <EmptyState
          compact
          icon={Users}
          title="Define who you’re speaking to"
          description={
            hasStory
              ? "Use the brand story to define guest personas."
              : "Save the brand story before defining personas."
          }
          actions={
            <>
              {hasStory ? (
                <Button
                  size="sm"
                  disabled={suggest.isPending || create.isPending}
                  onClick={() => void define()}
                >
                  <Sparkles className="size-3.5" />
                  Define personas
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link href="#brand-story">Write story</Link>
                </Button>
              )}
              <ShapeBrandButton
                brandId={brand.id}
                brandName={brand.name}
                section="personas"
              />
            </>
          }
        />
      )}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        {personas.map((persona) => (
          <article
            key={persona.id}
            className="space-y-3 rounded-xl border bg-muted/40 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{persona.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {persona.description}
                </p>
              </div>
              <PersonaEditor persona={persona} />
            </div>
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
      <AudienceMap
        audiences={[{ id: persona.id, name: persona.name, geography }]}
        context="persona"
      />
    </section>
  );
}
function PersonaEditor({ persona }: { persona: Persona }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(persona?.name ?? "");
  const [description, setDescription] = useState(persona?.description ?? "");
  const [origin, setOrigin] = useState(persona?.demandGeography ?? {});
  const [destination, setDestination] = useState(
    persona?.destinationGeography ?? {},
  );
  const update = useMutation(orpc.persona.update.mutationOptions());
  const busy = update.isPending;
  const save = async () => {
    try {
      const fields = {
        name,
        description: description || null,
        demandGeography: located(origin) ? origin : null,
        destinationGeography: located(destination) ? destination : null,
      };
      await update.mutateAsync({ personaId: persona.id, ...fields });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save persona",
      );
    }
  };
  return (
    <SimpleDialog
      title="Edit persona"
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setName(persona?.name ?? "");
          setDescription(persona?.description ?? "");
          setOrigin(persona?.demandGeography ?? {});
          setDestination(persona?.destinationGeography ?? {});
        }
        setOpen(next);
      }}
      trigger={
        <Button size="sm" variant="outline" aria-label={`Edit ${persona.name}`}>
          <Pencil className="size-3.5" />
        </Button>
      }
      footer={
        <Button disabled={!name.trim() || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save persona"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Label>
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Label>
        <Label>
          Description
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Label>
        <GeoFields
          title="Where they live / travel from (optional)"
          value={origin}
          onChange={setOrigin}
        />
        <GeoFields
          title="Destinations of interest (optional)"
          value={destination}
          onChange={setDestination}
        />
      </div>
    </SimpleDialog>
  );
}
function GeoFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: PersonaDemandGeography;
  onChange: (value: PersonaDemandGeography) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="text-xs font-medium">{title}</legend>
      {(
        [
          ["countries", "Country codes (US, CA)"],
          ["states", "US state codes (NY, OH)"],
          ["regions", "Regions"],
          ["cities", "Cities"],
        ] as const
      ).map(([field, label]) => (
        <Label key={field} className="block">
          {label}
          <Input
            defaultValue={value[field]?.join(", ") ?? ""}
            onBlur={(e) =>
              onChange({
                ...value,
                [field]: e.target.value
                  .split(",")
                  .map((s) =>
                    field === "countries" || field === "states"
                      ? s.trim().toUpperCase()
                      : s.trim(),
                  )
                  .filter(Boolean),
              })
            }
          />
        </Label>
      ))}
    </fieldset>
  );
}
