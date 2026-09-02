"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

type AudienceRow = {
  id: string;
  name: string;
  personaId: string | null;
  persona?: { id: string; name: string } | null;
  ageMin: number | null;
  ageMax: number | null;
  geography: {
    countries?: string[];
    states?: string[];
    regions?: string[];
    cities?: string[];
  } | null;
  keywords: string[] | null;
};

type PersonaOption = {
  id: string;
  name: string;
  ageRanges: string[] | null;
  geographies: string[] | null;
};

/**
 * The campaign's audiences: each row is one buyable narrowing that the push
 * compiles to a Meta ad set / Google ad group. Budgets here are advisory
 * splits; the authoritative number lives on each platform's draft.
 */
export function Audiences({
  campaignId,
  audiences,
  personas,
  geoPrefill,
}: {
  campaignId: string;
  audiences: AudienceRow[];
  personas: PersonaOption[];
  /** Where this client's homes are, rolled up from their property rows. */
  geoPrefill?: {
    countries?: string[];
    states?: string[];
    regions?: string[];
    cities?: string[];
  } | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState("");
  // Broad by default: 18 to 65+ with a geography layer is the shape that
  // reaches enough people to leave the learning phase at these budgets.
  // Narrowing is a decision someone makes on purpose, in the field.
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("");
  const [countries, setCountries] = useState(
    (geoPrefill?.countries ?? ["US"]).join(", "),
  );
  const [states, setStates] = useState((geoPrefill?.states ?? []).join(", "));
  const [regions, setRegions] = useState((geoPrefill?.regions ?? []).join(", "));
  const [cities, setCities] = useState((geoPrefill?.cities ?? []).join(", "));
  const [keywords, setKeywords] = useState("");

  const add = useMutation(
    trpc.ads.addAudience.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setKeywords("");
        router.refresh();
      },
    }),
  );
  const remove = useMutation(
    trpc.ads.deleteAudience.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  const applyPersona = (id: string) => {
    setPersonaId(id);
    const persona = personas.find((row) => row.id === id);
    if (!persona) return;
    if (!name) setName(persona.name);
    // Loose persona prose seeds the strict fields where it parses; the
    // operator corrects the rest. "30-50" is worth parsing, "retirees" is not.
    const range = persona.ageRanges?.find((value) =>
      /^\d{2}\s*-\s*\d{2,3}$/.test(value.trim()),
    );
    if (range) {
      const [min, max] = range.split("-").map((part) => part.trim());
      setAgeMin(min ?? "");
      setAgeMax(max ?? "");
    }
    if (persona.geographies?.length) setRegions(persona.geographies.join(", "));
  };

  const list = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const describe = (row: AudienceRow) =>
    [
      row.ageMin != null || row.ageMax != null
        ? `${row.ageMin ?? "13"}–${row.ageMax ?? "65+"}`
        : null,
      [
        ...(row.geography?.cities ?? []),
        ...(row.geography?.regions ?? row.geography?.states ?? []),
        ...(row.geography?.countries ?? []),
      ]
        .slice(0, 3)
        .join(", ") || null,
      row.keywords?.length
        ? `${row.keywords.length} keyword suggestion${row.keywords.length === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="bg-card rounded-xl border p-3.5">
      <div className="flex items-center gap-2">
        <Users className="text-muted-foreground size-4" />
        <p className="text-sm font-semibold">
          Audiences
          {audiences.length > 0 && (
            <span className="text-muted-foreground ml-1.5 font-normal">
              {audiences.length}
            </span>
          )}
        </p>
        <span className="text-muted-foreground text-xs">
          Who this campaign buys. Each becomes an ad set on Meta, an ad group on
          Google.
        </span>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="size-3.5" />
                Add audience
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add an audience</DialogTitle>
                <DialogDescription>
                  One coherent targeting cell: one age window, one geography.
                  Want two age ranges? Add two audiences.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {personas.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-persona">From persona</Label>
                    <select
                      id="aud-persona"
                      value={personaId}
                      onChange={(event) => applyPersona(event.target.value)}
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="">None — from scratch</option>
                      {personas.map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {persona.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="aud-name">Name</Label>
                  <Input
                    id="aud-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Northeast travelers 28-45"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-age-min">Age from</Label>
                    <Input
                      id="aud-age-min"
                      inputMode="numeric"
                      value={ageMin}
                      onChange={(event) => setAgeMin(event.target.value)}
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-age-max">to</Label>
                    <Input
                      id="aud-age-max"
                      inputMode="numeric"
                      value={ageMax}
                      onChange={(event) => setAgeMax(event.target.value)}
                      placeholder="50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-countries">Countries</Label>
                    <Input
                      id="aud-countries"
                      value={countries}
                      onChange={(event) => setCountries(event.target.value)}
                      placeholder="US"
                    />
                    <p className="text-muted-foreground text-[11px]">
                      ISO codes, comma-separated.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-states">States</Label>
                    <Input
                      id="aud-states"
                      value={states}
                      onChange={(event) => setStates(event.target.value)}
                      placeholder="CO"
                    />
                    <p className="text-muted-foreground text-[11px]">
                      Two-letter codes, as the client&rsquo;s listings state
                      them.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-regions">Regions</Label>
                    <Input
                      id="aud-regions"
                      value={regions}
                      onChange={(event) => setRegions(event.target.value)}
                      placeholder="Colorado"
                    />
                    <p className="text-muted-foreground text-[11px]">
                      Resolved to real platform geo keys at push.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aud-cities">Cities</Label>
                    <Input
                      id="aud-cities"
                      value={cities}
                      onChange={(event) => setCities(event.target.value)}
                      placeholder="Winter Park"
                    />
                    <p className="text-muted-foreground text-[11px]">
                      A metro layer, when the state is too wide a buy.
                    </p>
                  </div>
                </div>
                {geoPrefill?.states?.length ? (
                  <p className="text-muted-foreground text-[11px]">
                    Prefilled from where their homes are:{" "}
                    {(geoPrefill.regions ?? geoPrefill.states).join(", ")}.
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="aud-keywords">Keyword suggestions</Label>
                  <Input
                    id="aud-keywords"
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    placeholder="luxury vacation rentals, monthly stays"
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Loose, comma-separated. Google derives its keywords from
                    these; Meta ignores them.
                  </p>
                </div>
                {add.error && (
                  <p className="text-xs text-red-300">{add.error.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  disabled={!name.trim()}
                  loading={add.isPending}
                  onClick={() =>
                    add.mutate({
                      campaignId,
                      name: name.trim(),
                      personaId: personaId || null,
                      ageMin: ageMin ? Number(ageMin) : null,
                      ageMax: ageMax ? Number(ageMax) : null,
                      countries: list(countries.toUpperCase()),
                      states: list(states.toUpperCase()),
                      regions: list(regions),
                      cities: list(cities),
                      keywords: list(keywords),
                    })
                  }
                >
                  Add audience
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {audiences.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          No audiences yet — the push runs one broad ad set. Broad is a
          legitimate choice; a split is how you test who responds.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-white/5">
          {audiences.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.name}
                  {row.persona && (
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      · {row.persona.name}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {describe(row) || "Broad"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-7"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ audienceId: row.id })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {remove.error && (
        <p className="mt-2 text-xs text-red-300">{remove.error.message}</p>
      )}
    </div>
  );
}
