"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { GeographyChips } from "@/components/geography-chips";
import { DefinePersonasButton } from "@/app/app/brands/[brandSlug]/ads/DefinePersonasButton";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/orpc/client";

type Brand = { id: string; name: string };

type PersonaForm = {
  personaId?: string;
  name: string;
  description: string;
  ageRanges: string;
  geographies: string;
  demandStates: string;
  demandCities: string;
  demandCountries: string;
  demandRegions: string;
  demandSource: string;
  notes: string;
};

const EMPTY: PersonaForm = {
  name: "",
  description: "",
  ageRanges: "",
  geographies: "",
  demandStates: "",
  demandCities: "",
  demandCountries: "",
  demandRegions: "",
  demandSource: "",
  notes: "",
};

/**
 * The persona library: the stable "who we talk to" per brand — the people
 * counterpart of content pillars. Loose planning metadata only; the strict,
 * buyable narrowing lives on each campaign's audiences.
 */
export function PersonasClient({
  brands,
  embedded = false,
  launchBrief = false,
  brandSlug,
}: {
  brands: Brand[];
  /** Rendered inside another page (the brand Strategy page): drop the page
   * shell and the big header so it aligns with the surrounding sections. */
  embedded?: boolean;
  /** A compact persona + guest-origin editor inside the Performance brief. */
  launchBrief?: boolean;
  brandSlug?: string;
}) {
  const queryClient = useQueryClient();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [form, setForm] = useState<PersonaForm | null>(null);

  const personas = useQuery(
    orpc.persona.list.queryOptions({
      input: { brandId },
      enabled: Boolean(brandId),
    }),
  );
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: orpc.persona.list.queryKey({ input: { brandId } }),
    });

  const create = useMutation(
    orpc.persona.create.mutationOptions({
      onSuccess: () => {
        setForm(null);
        invalidate();
      },
    }),
  );
  const update = useMutation(
    orpc.persona.update.mutationOptions({
      onSuccess: () => {
        setForm(null);
        invalidate();
      },
    }),
  );
  const remove = useMutation(
    orpc.persona.delete.mutationOptions({ onSuccess: invalidate }),
  );

  const list = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const save = () => {
    if (!form) return;
    const demand = {
      countries: list(form.demandCountries).map((c) => c.toUpperCase()),
      states: list(form.demandStates).map((s) => s.toUpperCase()),
      regions: list(form.demandRegions),
      cities: list(form.demandCities),
      source: form.demandSource.trim() || null,
    };
    const hasDemand =
      demand.countries.length ||
      demand.states.length ||
      demand.regions.length ||
      demand.cities.length ||
      demand.source;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      ageRanges: list(form.ageRanges),
      geographies: list(form.geographies),
      demandGeography: hasDemand ? demand : null,
      notes: form.notes.trim() || null,
    };
    if (form.personaId) {
      update.mutate({ personaId: form.personaId, ...payload });
    } else {
      create.mutate({ brandId, ...payload });
    }
  };

  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error ?? remove.error;

  return (
    <div
      className={
        embedded ? "space-y-6" : "mx-auto w-full max-w-4xl space-y-6 @xl:p-6"
      }
    >
      <header
        className={
          embedded
            ? "flex flex-wrap items-center justify-end gap-3"
            : "flex flex-wrap items-end justify-between gap-3"
        }
      >
        {!embedded && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Who each brand talks to — the people counterpart of pillars. Few
              and stable. Campaigns narrow a persona into a buyable audience
              with real targeting and budget.
            </p>
          </div>
        )}
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
          {brands.length > 1 && (
            <select
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="h-9 max-w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          )}
          {launchBrief && brands[0] ? (
            <DefinePersonasButton
              brandId={brandId}
              brandName={brands[0].name}
            />
          ) : null}
          <Button size="sm" onClick={() => setForm(EMPTY)}>
            <Plus className="size-3.5" />
            New persona
          </Button>
        </div>
      </header>

      {personas.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : personas.error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load personas: {personas.error.message}
        </p>
      ) : (personas.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <Users className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No personas yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {launchBrief
              ? "Define who books these homes, then add where those guests come from."
              : "Start with the two or three kinds of people this brand exists for. Campaigns narrow each persona into targeting."}
          </p>
        </div>
      ) : (
        <div
          className={
            launchBrief
              ? "space-y-3"
              : "grid grid-cols-1 gap-3 @2xl:grid-cols-2"
          }
        >
          {(personas.data ?? []).map((persona) => (
            <div key={persona.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{persona.name}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    aria-label={`Edit ${persona.name}`}
                    onClick={() =>
                      setForm({
                        personaId: persona.id,
                        name: persona.name,
                        description: persona.description ?? "",
                        ageRanges: (persona.ageRanges ?? []).join(", "),
                        geographies: (persona.geographies ?? []).join(", "),
                        demandStates: (
                          persona.demandGeography?.states ?? []
                        ).join(", "),
                        demandCities: (
                          persona.demandGeography?.cities ?? []
                        ).join(", "),
                        demandCountries: (
                          persona.demandGeography?.countries ?? []
                        ).join(", "),
                        demandRegions: (
                          persona.demandGeography?.regions ?? []
                        ).join(", "),
                        demandSource: persona.demandGeography?.source ?? "",
                        notes: persona.notes ?? "",
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="muted"
                    className="h-7"
                    aria-label={`Delete ${persona.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ personaId: persona.id })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {persona.description && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {persona.description}
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {[
                  (persona.ageRanges ?? []).join(", "),
                  (persona.geographies ?? []).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ") || "No planning metadata yet"}
              </p>
              {launchBrief ? (
                <div className="mt-3 space-y-1.5 border-t pt-3">
                  <p className="text-[11px] font-medium">Guest origins</p>
                  {[
                    persona.demandGeography?.states,
                    persona.demandGeography?.cities,
                    persona.demandGeography?.countries,
                    persona.demandGeography?.regions,
                  ].some((locations) => locations?.length) ? (
                    <>
                      <GeographyChips
                        label="States"
                        values={persona.demandGeography?.states}
                      />
                      <GeographyChips
                        label="Cities"
                        values={persona.demandGeography?.cities}
                      />
                      <GeographyChips
                        label="Countries"
                        values={persona.demandGeography?.countries}
                      />
                      <GeographyChips
                        label="Regions"
                        values={persona.demandGeography?.regions}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Guest-origin locations haven’t been added yet.
                    </p>
                  )}
                  {persona.demandGeography?.source ? (
                    <p className="text-[11px] text-muted-foreground">
                      Source: {persona.demandGeography.source}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {launchBrief && brandSlug ? (
        <Link
          href={`/app/performance/brands/${brandSlug}/setup#meta-audiences`}
          className="inline-block text-xs text-primary hover:underline"
        >
          Manage Meta audiences & seed lists →
        </Link>
      ) : null}

      {error && <p className="text-xs text-red-300">{error.message}</p>}

      <Dialog
        open={form !== null}
        onOpenChange={(next) => !next && setForm(null)}
      >
        <DialogContent className="max-w-md" scrollable>
          <DialogHeader>
            <DialogTitle>
              {form?.personaId ? "Edit persona" : "New persona"}
            </DialogTitle>
            <DialogDescription>
              {launchBrief
                ? "Describe the guests and where they come from. Campaign targeting is configured separately."
                : "Planning metadata only — loose prose, never ad targeting."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pers-name">Name</Label>
                <Input
                  id="pers-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Remote workers who travel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pers-description">Description</Label>
                <Textarea
                  id="pers-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Why the brand exists for them, what they struggle with."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pers-ages">Age ranges</Label>
                  <Input
                    id="pers-ages"
                    value={form.ageRanges}
                    onChange={(event) =>
                      setForm({ ...form, ageRanges: event.target.value })
                    }
                    placeholder="30-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pers-geos">Geographies (prose)</Label>
                  <Input
                    id="pers-geos"
                    value={form.geographies}
                    onChange={(event) =>
                      setForm({ ...form, geographies: event.target.value })
                    }
                    placeholder="California, big US cities"
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-xs font-semibold">Guest origins</p>
                  <p className="text-[11px] text-muted-foreground">
                    Where the guests we want come from. The structured source a
                    campaign audience derives from. Comma-separated.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pers-dstates">States (2-letter)</Label>
                    <Input
                      id="pers-dstates"
                      value={form.demandStates}
                      onChange={(event) =>
                        setForm({ ...form, demandStates: event.target.value })
                      }
                      placeholder="CA, TX, AZ"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pers-dcities">Cities</Label>
                    <Input
                      id="pers-dcities"
                      value={form.demandCities}
                      onChange={(event) =>
                        setForm({ ...form, demandCities: event.target.value })
                      }
                      placeholder="Los Angeles, Dallas"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pers-dcountries">Countries</Label>
                    <Input
                      id="pers-dcountries"
                      value={form.demandCountries}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          demandCountries: event.target.value,
                        })
                      }
                      placeholder="US"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pers-dregions">Region names</Label>
                    <Input
                      id="pers-dregions"
                      value={form.demandRegions}
                      onChange={(event) =>
                        setForm({ ...form, demandRegions: event.target.value })
                      }
                      placeholder="California"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pers-dsource">Source</Label>
                  <Input
                    id="pers-dsource"
                    value={form.demandSource}
                    onChange={(event) =>
                      setForm({ ...form, demandSource: event.target.value })
                    }
                    placeholder="Pasted from bookings export, 2026-09"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pers-notes">Notes</Label>
                <Textarea
                  id="pers-notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              disabled={!form?.name.trim()}
              loading={pending}
              onClick={save}
            >
              {form?.personaId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
