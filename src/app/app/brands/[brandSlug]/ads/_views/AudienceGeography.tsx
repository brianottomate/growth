"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { GeographyChips } from "@/components/geography-chips";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/orpc/client";
import type { DeliveryGeography } from "@/server/db/ads-schema";

const fields = [
  ["countries", "Countries", "Country codes, e.g. US"],
  ["states", "States", "US state codes, e.g. OH"],
  ["regions", "Regions", "Qualified regions"],
  ["cities", "Cities", "Qualified cities, e.g. Columbus, OH"],
] as const;

export function AudienceGeography({
  audience,
}: {
  audience: { id: string; name: string; geography?: DeliveryGeography | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map(([key]) => [
        key,
        (audience.geography?.[key] ?? []).join("\n"),
      ]),
    ),
  );
  const save = useMutation(
    orpc.ads.updateAudience.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const configured = fields.some(([key]) => audience.geography?.[key]?.length);
  return (
    <section className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium">Intended geography</p>
      {fields.map(([key, label]) => (
        <GeographyChips
          key={key}
          label={label}
          values={audience.geography?.[key]}
        />
      ))}
      {!configured && (
        <p className="text-xs text-muted-foreground">Not specified.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Where we want to reach people. Confirm delivery targeting in each
        platform plan.
      </p>
      <Button
        size="sm"
        variant="outline"
        aria-label={`${open ? "Close" : "Edit"} intended geography for ${audience.name}`}
        onClick={() => {
          if (!open)
            setValues(
              Object.fromEntries(
                fields.map(([key]) => [
                  key,
                  (audience.geography?.[key] ?? []).join("\n"),
                ]),
              ),
            );
          setOpen(!open);
        }}
      >
        {open ? "Cancel" : "Edit geography"}
      </Button>
      {open && (
        <div className="space-y-3">
          {fields.map(([key, label, placeholder]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`${audience.id}-intent-${key}`}>{label}</Label>
              <Textarea
                id={`${audience.id}-intent-${key}`}
                rows={2}
                placeholder={placeholder}
                value={values[key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </div>
          ))}
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                audienceId: audience.id,
                geography: Object.fromEntries(
                  fields.map(([key]) => [
                    key,
                    (values[key] ?? "")
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ]),
                ),
              })
            }
          >
            Save geography
          </Button>
          {save.error && (
            <p className="text-xs text-destructive">{save.error.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
