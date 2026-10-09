"use client";
import type { PersonaProfile } from "@/lib/brand-direction";
import { DirectionPhrases } from "./CreativeDirection";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles, Users } from "lucide-react";
import { ShapeBrandButton } from "./ShapeBrandButton";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

type Persona = {
  id: string;
  name: string;
  description: string | null;
  profile?: PersonaProfile | null;
};
export function PersonaAudiences({
  brand,
  personas,
}: {
  brand: { id: string; slug: string; name: string; story: string | null };
  personas: Persona[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"defining" | "saving" | null>(null);
  const [refreshing, startTransition] = useTransition();
  const suggest = useMutation(orpc.persona.suggest.mutationOptions());
  const create = useMutation(orpc.persona.create.mutationOptions());
  const busy = phase !== null || refreshing;
  const define = async () => {
    if (busy || personas.length) return;
    setPhase("defining");
    try {
      const result = await suggest.mutateAsync({ brandId: brand.id });
      setPhase("saving");
      for (const proposal of result.suggestions)
        await create.mutateAsync({ brandId: brand.id, ...proposal });
      if (!result.suggestions.length) toast.info("No personas suggested");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not define personas",
      );
    } finally {
      startTransition(() => router.refresh());
      setPhase(null);
    }
  };
  const generate = (primary = false) => (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      loading={busy}
      disabled={!brand.story?.trim()}
      onClick={() => void define()}
    >
      {!busy && <Sparkles className="size-3.5" />}
      {phase === "saving"
        ? "Saving personas…"
        : busy
          ? "Defining personas…"
          : "Define personas"}
    </Button>
  );
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
        <div className="flex flex-wrap gap-2">
          {!personas.length && generate()}
          {shape}
        </div>
      </div>
      {!personas.length && (
        <EmptyState
          compact
          icon={Users}
          title="Define who you’re speaking to"
          description={
            busy
              ? "Reading the brand story and defining customer personas…"
              : brand.story?.trim()
                ? "Define customer personas from the brand story."
                : "Write the brand story to define customer personas."
          }
          actions={generate(true)}
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
          </article>
        ))}
      </div>
    </div>
  );
}
function PersonaProfileDetails({ profile }: { profile: PersonaProfile }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{profile.motivation}</p>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <DirectionPhrases title="Needs" values={profile.needs.slice(0, 3)} />
        <DirectionPhrases
          title="Decision criteria"
          values={profile.decisionCriteria.slice(0, 3)}
        />
      </div>
      {profile.objections.length > 0 && (
        <DirectionPhrases title="Objections" values={profile.objections} />
      )}
      <p className="text-xs text-muted-foreground">{profile.evidenceNote}</p>
    </div>
  );
}
