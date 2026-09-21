"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { AudienceMap } from "@/components/audience-map";
import { GeographyChips } from "@/components/geography-chips";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { sendAssistantIntent } from "@/lib/assistant-events";
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
  campaignName,
  brandId,
  brandName,
  audiences,
  personas,
  geoPrefill,
  emptyActions,
}: {
  campaignId: string;
  campaignName: string;
  brandId: string;
  brandName: string;
  audiences: AudienceRow[];
  personas: PersonaOption[];
  /** Where this client's homes are, rolled up from their property rows. */
  geoPrefill?: {
    countries?: string[];
    states?: string[];
    regions?: string[];
    cities?: string[];
  } | null;
  /** Extra buttons for the empty state, rendered by the page. */
  emptyActions?: React.ReactNode;
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
  const [countries, setCountries] = useState("US");
  const [states, setStates] = useState("");
  const [regions, setRegions] = useState("");
  const [cities, setCities] = useState("");
  const [keywords, setKeywords] = useState("");

  /**
   * Offered, not applied. Where a client's homes are is a fact worth having on
   * the page, and "advertise where the houses are" is a guess about strategy —
   * a lot of guests fly in from somewhere else entirely. So it sits behind a
   * button, and the agent gets the same numbers to reason about.
   */
  const applyTheirMarkets = () => {
    if (!geoPrefill) return;
    setCountries((geoPrefill.countries ?? ["US"]).join(", "));
    setStates((geoPrefill.states ?? []).join(", "));
    setRegions((geoPrefill.regions ?? []).join(", "));
    setCities((geoPrefill.cities ?? []).join(", "));
  };

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

  return (
    <div className="space-y-2">
      <div
        className={
          audiences.length === 0
            ? "hidden"
            : "flex items-center justify-end gap-2"
        }
      >
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
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                    <p className="text-[11px] text-muted-foreground">
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
                    <p className="text-[11px] text-muted-foreground">
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
                    <p className="text-[11px] text-muted-foreground">
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
                    <p className="text-[11px] text-muted-foreground">
                      A metro layer, when the state is too wide a buy.
                    </p>
                  </div>
                </div>
                {geoPrefill?.states?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Their homes are in{" "}
                      {(geoPrefill.regions ?? geoPrefill.states).join(", ")}.
                    </p>
                    <button
                      type="button"
                      onClick={applyTheirMarkets}
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Use their markets
                    </button>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="aud-keywords">Keyword suggestions</Label>
                  <Input
                    id="aud-keywords"
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    placeholder="luxury vacation rentals, monthly stays"
                  />
                  <p className="text-[11px] text-muted-foreground">
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
        {emptyActions}
      </div>

      {audiences.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="Broad, for now"
          description="The push runs one broad ad set. Add an audience to narrow by age or place."
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <Plus className="size-3.5" />
                Add audience
              </Button>
              {emptyActions}
            </>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <h3 className="font-semibold">Guest-origin coverage</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Where this campaign will look for guests. Each audience becomes
                a separate ad set.
              </p>
            </div>
            {audiences.map((row) => (
              <div key={row.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{row.name}</p>
                    {row.persona && (
                      <p className="text-xs text-muted-foreground">
                        {row.persona.name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="muted"
                      className="h-7"
                      aria-label={`Edit ${row.name} in chat`}
                      title="Edit audience in chat"
                      onClick={() =>
                        sendAssistantIntent({
                          type: "work_ad_campaign",
                          brandId,
                          brandName,
                          campaignId,
                          campaignName,
                          focus: "audiences",
                          visibleText: `Help me edit the audience “${row.name}” (${row.id}) in “${campaignName}”. Read its current settings and ask what I would like to change.`,
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
                      aria-label={`Remove ${row.name}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ audienceId: row.id })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <GeographyChips
                    label="Countries"
                    values={row.geography?.countries}
                  />
                  <GeographyChips
                    label="States"
                    values={row.geography?.states}
                  />
                  <GeographyChips
                    label="Regions"
                    values={row.geography?.regions}
                  />
                  <GeographyChips
                    label="Cities"
                    values={row.geography?.cities}
                  />
                  <GeographyChips
                    label="Keyword suggestions"
                    values={row.keywords ?? undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.ageMin != null || row.ageMax != null
                      ? `Ages ${row.ageMin ?? 13}–${row.ageMax ?? "65+"}`
                      : "No age narrowing"}
                  </p>
                </div>
              </div>
            ))}
          </section>
          <aside className="space-y-4 rounded-xl border bg-card p-5">
            <AudienceMap audiences={audiences} />
          </aside>
        </div>
      )}
      {remove.error && (
        <p className="mt-2 text-xs text-red-300">{remove.error.message}</p>
      )}
    </div>
  );
}
