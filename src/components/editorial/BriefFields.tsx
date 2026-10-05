"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { CreativeBrief } from "@/lib/creative-document";

export function BriefFields({
  brief,
  onChange,
}: {
  brief: CreativeBrief;
  onChange: (brief: CreativeBrief) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
        {(
          [
            ["purpose", "Purpose", "What should this piece achieve?"],
            ["audience", "Audience", "Who is this for?"],
            [
              "direction",
              "Writing direction",
              "Angle, structure, tone and key points",
            ],
            ["cta", "Call to action", "What should the reader do next?"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="space-y-2 text-sm">
            <span className="font-medium">{label}</span>
            <Textarea
              className="min-h-28"
              value={brief[key]}
              placeholder={placeholder}
              onChange={(e) => onChange({ ...brief, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Facts and sources</h3>
          <p className="text-xs text-muted-foreground">
            Include supported claims here. Put anything still unverified in
            constraints.
          </p>
        </div>
        {brief.facts.map((fact, index) => (
          <div
            className="grid grid-cols-1 gap-2 @2xl:grid-cols-[1fr_1fr_auto]"
            key={index}
          >
            <Input
              aria-label={`Fact ${index + 1}`}
              value={fact.claim}
              placeholder="Supported claim"
              onChange={(e) =>
                onChange({
                  ...brief,
                  facts: brief.facts.map((f, i) =>
                    i === index ? { ...f, claim: e.target.value } : f,
                  ),
                })
              }
            />
            <Input
              aria-label={`Source ${index + 1}`}
              value={fact.sourceUrl ?? ""}
              placeholder="https://source-url (optional)"
              onChange={(e) =>
                onChange({
                  ...brief,
                  facts: brief.facts.map((f, i) =>
                    i === index
                      ? { ...f, sourceUrl: e.target.value || undefined }
                      : f,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              onClick={() =>
                onChange({
                  ...brief,
                  facts: brief.facts.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...brief, facts: [...brief.facts, { claim: "" }] })
          }
        >
          Add fact
        </Button>
      </section>
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Constraints and open questions</span>
        <Textarea
          className="min-h-28"
          placeholder="Unverified claims, things to avoid, and questions to resolve — one per line"
          value={brief.constraints.join("\n")}
          onChange={(e) =>
            onChange({ ...brief, constraints: e.target.value.split("\n") })
          }
        />
      </label>
      {brief.assets.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {brief.assets.length} saved reference assets. Chat can update these
          references.
        </p>
      )}
    </div>
  );
}
