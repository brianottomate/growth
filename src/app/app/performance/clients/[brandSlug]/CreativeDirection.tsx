"use client";

import {
  ARCHETYPES,
  effectiveVoice,
  type Archetype,
  VOICE_AXES,
  type CreativeDirection as Direction,
} from "@/lib/brand-direction";

import { useState } from "react";
import {
  Compass,
  Heart,
  Map,
  Sparkles,
  PartyPopper,
  GraduationCap,
  Users,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
import { useWorkspaceMutation } from "./useWorkspaceMutation";

const ARCHETYPE_ICONS = {
  guide: Compass,
  caregiver: Heart,
  explorer: Map,
  creator: Sparkles,
  entertainer: PartyPopper,
  expert: GraduationCap,
  companion: Users,
};

export function ArchetypeSelector({
  value,
  brandId,
}: {
  value: Direction;
  brandId: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const save = useWorkspaceMutation(
    orpc.brand.setStory.mutationOptions({
      onSuccess: () => setChoosing(false),
    }),
  );
  const archetype = value.archetype ? ARCHETYPES[value.archetype] : null;
  const Icon = value.archetype ? ARCHETYPE_ICONS[value.archetype] : Compass;
  return (
    <Popover open={choosing} onOpenChange={setChoosing}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={save.isPending}
          aria-label={`Archetype: ${archetype?.label ?? "Choose archetype"}`}
        >
          <Icon className="size-3.5" />
          {archetype?.label ?? "Archetype"}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="@container w-[min(36rem,calc(100vw-2rem))] space-y-3"
      >
        <div>
          <h3 className="text-sm font-medium">Brand archetype</h3>
          <p className="text-xs text-muted-foreground">
            Sets the brand’s role and default voice.
          </p>
        </div>
        <div
          className="grid grid-cols-1 gap-2 @lg:grid-cols-2"
          aria-label="Archetype"
        >
          {(Object.keys(ARCHETYPES) as Archetype[]).map((key) => {
            const entry = ARCHETYPES[key];
            const EntryIcon = ARCHETYPE_ICONS[key];
            return (
              <button
                key={key}
                type="button"
                disabled={save.isPending}
                aria-pressed={value.archetype === key}
                onClick={() =>
                  save.mutate({
                    brandId,
                    creativeDirection: { ...value, archetype: key },
                  })
                }
                className={`flex items-start gap-2 rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${value.archetype === key ? "border-foreground bg-muted" : "hover:bg-muted/50"}`}
              >
                <EntryIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">
                    {entry.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CreativeDirection({
  value,
  brandId,
}: {
  value: Direction;
  brandId: string;
}) {
  const save = useWorkspaceMutation(orpc.brand.setStory.mutationOptions());
  const voice = effectiveVoice(value);
  const update = (patch: Partial<Direction>) =>
    save.mutate({
      brandId,
      creativeDirection: { ...value, ...patch },
    });
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-xl font-medium tracking-tight">
        {value.positioning}
      </p>
      <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Voice</h3>
            {value.voice && (
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => update({ voice: null })}
              >
                Use archetype defaults
              </Button>
            )}
          </div>
          {(Object.keys(VOICE_AXES) as (keyof typeof VOICE_AXES)[]).map(
            (axis) => {
              const labels = VOICE_AXES[axis];
              const position = voice[axis];
              return (
                <div
                  key={axis}
                  className="space-y-1.5"
                  aria-label={`${labels[0]} to ${labels[4]}: ${labels[position]}`}
                >
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{labels[0]}</span>
                    <span className="font-medium text-foreground">
                      {labels[position]}
                    </span>
                    <span>{labels[4]}</span>
                  </div>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label={`${labels[0]} to ${labels[4]}`}
                  >
                    {labels.map((label, i) => (
                      <button
                        type="button"
                        key={label}
                        aria-label={label}
                        aria-pressed={i === position}
                        disabled={save.isPending}
                        onClick={() =>
                          update({ voice: { ...voice, [axis]: i } })
                        }
                        className="flex h-6 flex-1 items-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span
                          className={`h-1.5 w-full rounded-full ${i === position ? "bg-foreground" : "bg-muted"}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            },
          )}
        </div>
        <div className="space-y-4">
          <DirectionPhrases title="Lead with" values={value.leadWith} />
          <DirectionPhrases title="Avoid" values={value.neverSay} />
        </div>
      </div>
    </div>
  );
}
export function DirectionPhrases({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return values.length ? (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="rounded-lg bg-muted px-2.5 py-1 text-sm">
            {value}
          </span>
        ))}
      </div>
    </div>
  ) : null;
}
