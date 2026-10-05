"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
export function CampaignAudienceContext({
  audience,
  personas,
  homes,
}: {
  audience: {
    id: string;
    name: string;
    personaId: string | null;
    homeIds: string[] | null;
  };
  personas: { id: string; name: string }[];
  homes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personaId, setPersonaId] = useState(audience.personaId ?? "");
  const [homeIds, setHomeIds] = useState(new Set(audience.homeIds ?? []));
  const update = useMutation(orpc.ads.updateAudience.mutationOptions());
  const save = async () => {
    try {
      await update.mutateAsync({
        audienceId: audience.id,
        personaId: personaId || null,
        homeIds: [...homeIds],
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save audience context",
      );
    }
  };
  return (
    <SimpleDialog
      title={`Context for ${audience.name}`}
      description="Connect brand strategy and relevant homes. These choices inform creative; they do not change platform targeting."
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setPersonaId(audience.personaId ?? "");
          setHomeIds(new Set(audience.homeIds ?? []));
        }
      }}
      trigger={
        <Button size="sm" variant="outline">
          Persona &amp; homes
        </Button>
      }
      footer={
        <Button disabled={update.isPending} onClick={() => void save()}>
          Save context
        </Button>
      }
    >
      <div className="space-y-4">
        <Label>
          Persona (optional)
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
          >
            <option value="">No persona</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Relevant homes (optional)
          </legend>
          {homes.map((home) => (
            <label className="flex items-center gap-2 text-sm" key={home.id}>
              <input
                type="checkbox"
                checked={homeIds.has(home.id)}
                onChange={(e) =>
                  setHomeIds((previous) => {
                    const next = new Set(previous);
                    if (e.target.checked) next.add(home.id);
                    else next.delete(home.id);
                    return next;
                  })
                }
              />
              {home.name}
            </label>
          ))}
        </fieldset>
      </div>
    </SimpleDialog>
  );
}
