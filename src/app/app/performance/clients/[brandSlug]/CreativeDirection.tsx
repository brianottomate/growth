import { Compass } from "lucide-react";
import {
  VOICE_AXES,
  type CreativeDirection as Direction,
} from "@/lib/brand-direction";

export function CreativeDirection({ value }: { value: Direction }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="max-w-3xl text-xl font-medium tracking-tight">
          {value.positioning}
        </p>
        {value.archetype && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Compass className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground capitalize">
                {value.archetype}
              </span>
              {value.archetypeReason && ` · ${value.archetypeReason}`}
            </span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Voice</h3>
          {(Object.keys(VOICE_AXES) as (keyof typeof VOICE_AXES)[]).map(
            (axis) => {
              const labels = VOICE_AXES[axis];
              const position = value.voice[axis];
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
                  <div className="flex gap-1" aria-hidden="true">
                    {labels.map((label, i) => (
                      <span
                        key={label}
                        className={`h-1.5 flex-1 rounded-full ${i === position ? "bg-foreground" : "bg-muted"}`}
                      />
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
