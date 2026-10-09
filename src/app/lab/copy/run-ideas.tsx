"use client";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { RunReview } from "./run-review";

export function RunIdeas(props: ComponentProps<typeof RunReview>) {
  const [active, setActive] = useState("starter");
  const extras = props.result?.expandedIdeas ?? [];
  const options = [
    ...(props.result?.statusQuo
      ? [{ id: "status-quo", label: "Status quo" }]
      : []),
    ...(props.output.static || props.output.carousel
      ? [
          {
            id: "starter",
            label:
              props.variant?.label === "Occasion-led"
                ? "Occasion-led starter"
                : `${props.variant?.label ?? "Experimental"} starter`,
          },
        ]
      : []),
    ...extras.map((idea) => ({ id: idea.id, label: idea.label })),
  ];
  const selected =
    options.find((o) => o.id === active)?.id ?? options[0]?.id ?? "starter";
  const idea = extras.find((i) => i.id === selected);
  const baseline = selected === "status-quo";
  const output = baseline
    ? props.result!.statusQuo!
    : idea
      ? { catalog: null, static: null, carousel: idea.document }
      : props.output;
  const navigation =
    options.length > 0 ? (
      <nav
        aria-label={`Ideas · ${props.title}`}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={selected === option.id ? "default" : "outline"}
            aria-pressed={selected === option.id}
            onClick={() => setActive(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </nav>
    ) : undefined;
  return (
    <RunReview
      key={`${props.id}:${selected}`}
      {...props}
      id={selected === "starter" ? props.id : `${props.id}:${selected}`}
      title={props.title}
      output={output}
      navigation={navigation}
      result={
        idea && props.result
          ? { ...props.result, photoPlan: undefined }
          : props.result
      }
      onUse={selected === "starter" ? props.onUse : undefined}
    />
  );
}
