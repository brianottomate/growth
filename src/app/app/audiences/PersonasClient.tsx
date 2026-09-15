"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

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
import { useTRPC } from "@/trpc/react";

type Brand = { id: string; name: string };

type PersonaForm = {
  personaId?: string;
  name: string;
  description: string;
  ageRanges: string;
  geographies: string;
  notes: string;
};

const EMPTY: PersonaForm = {
  name: "",
  description: "",
  ageRanges: "",
  geographies: "",
  notes: "",
};

/**
 * The persona library: the stable "who we talk to" per brand — the people
 * counterpart of content pillars. Loose planning metadata only; the strict,
 * buyable narrowing lives on each campaign's audiences.
 */
export function PersonasClient({ brands }: { brands: Brand[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [form, setForm] = useState<PersonaForm | null>(null);

  const personas = useQuery(
    trpc.persona.list.queryOptions({ brandId }, { enabled: Boolean(brandId) }),
  );
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: trpc.persona.list.queryKey({ brandId }),
    });

  const create = useMutation(
    trpc.persona.create.mutationOptions({
      onSuccess: () => {
        setForm(null);
        invalidate();
      },
    }),
  );
  const update = useMutation(
    trpc.persona.update.mutationOptions({
      onSuccess: () => {
        setForm(null);
        invalidate();
      },
    }),
  );
  const remove = useMutation(
    trpc.persona.delete.mutationOptions({ onSuccess: invalidate }),
  );

  const list = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const save = () => {
    if (!form) return;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      ageRanges: list(form.ageRanges),
      geographies: list(form.geographies),
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
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Who each brand talks to — the people counterpart of pillars. Few and
            stable. Campaigns narrow a persona into a buyable audience with real
            targeting and budget.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <select
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => setForm(EMPTY)}>
            <Plus className="size-3.5" />
            New persona
          </Button>
        </div>
      </header>

      {personas.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (personas.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <Users className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No personas yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Start with the two or three kinds of people this brand exists for.
            &ldquo;Remote workers who travel&rdquo;, not &ldquo;CA remote
            workers 28-45&rdquo; — the narrowing happens per campaign.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(personas.data ?? []).map((persona) => (
            <div key={persona.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{persona.name}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() =>
                      setForm({
                        personaId: persona.id,
                        name: persona.name,
                        description: persona.description ?? "",
                        ageRanges: (persona.ageRanges ?? []).join(", "),
                        geographies: (persona.geographies ?? []).join(", "),
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
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-300">{error.message}</p>}

      <Dialog
        open={form !== null}
        onOpenChange={(next) => !next && setForm(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.personaId ? "Edit persona" : "New persona"}
            </DialogTitle>
            <DialogDescription>
              Planning metadata only — loose prose, never ad targeting.
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
                  <Label htmlFor="pers-geos">Geographies</Label>
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
