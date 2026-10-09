"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";

const lines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
export function DeliveryGroupEditor({
  group,
}: {
  group: { id: string; configuration?: DeliveryGroupConfiguration | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(group.configuration);
  const save = useMutation(
    orpc.ads.setDeliveryGroup.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  if (
    !config ||
    (config.platform !== "google_ads" && config.platform !== "meta_ads")
  )
    return null;
  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
        {open
          ? "Close settings"
          : config.platform === "google_ads"
            ? "Edit ad group"
            : "Edit ad set"}
      </Button>
      {open && (
        <div className="space-y-3 rounded-lg border p-3">
          {config.platform === "google_ads" ? (
            (["keywords", "excludedKeywords"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${group.id}-${key}`}>
                  {key === "keywords" ? "Search terms" : "Negative keywords"}
                </Label>
                <Textarea
                  id={`${group.id}-${key}`}
                  rows={5}
                  value={(config[key] ?? []).join("\n")}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: lines(e.target.value) })
                  }
                />
              </div>
            ))
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Delivery locations and ages for this Meta ad set.
              </p>
              <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
                {(["states", "countries", "regions", "cities"] as const).map(
                  (key) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`${group.id}-${key}`}>
                        {key === "states"
                          ? "US state codes"
                          : key === "countries"
                            ? "Country codes"
                            : key === "regions"
                              ? "International regions"
                              : "City targets"}
                      </Label>
                      <Textarea
                        id={`${group.id}-${key}`}
                        rows={2}
                        value={(config.targeting?.geography?.[key] ?? []).join(
                          "\n",
                        )}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            targeting: {
                              ...config.targeting,
                              geography: {
                                ...config.targeting?.geography,
                                [key]: lines(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                  ),
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["ageMin", "ageMax"] as const).map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${group.id}-${key}`}>
                      {key === "ageMin" ? "Minimum age" : "Maximum age"}
                    </Label>
                    <Input
                      id={`${group.id}-${key}`}
                      type="number"
                      value={config.targeting?.[key] ?? ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          targeting: {
                            ...config.targeting,
                            [key]: e.target.value
                              ? Number(e.target.value)
                              : null,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {save.error && (
            <p className="text-xs text-destructive">{save.error.message}</p>
          )}
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() =>
              save.mutate({ deliveryGroupId: group.id, configuration: config })
            }
          >
            Save delivery settings
          </Button>
        </div>
      )}
    </div>
  );
}
