"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  children,
}: {
  children?: ReactNode;
  group: {
    id: string;
    name?: string;
    configuration?: DeliveryGroupConfiguration | null;
  };
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setConfig(group.configuration);
          save.reset();
          setOpen(true);
        }}
      >
        Edit
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group.name ?? "Delivery settings"}</DialogTitle>
          <DialogDescription>
            {config.platform === "google_ads"
              ? "One keyword per line. Use [brackets] for exact match and quotes for phrase match."
              : "Locations and ages for this Meta ad set."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {config.platform === "google_ads" ? (
            (["keywords", "excludedKeywords"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${group.id}-${key}`}>
                  {key === "keywords" ? "Keywords" : "Group negative keywords"}
                </Label>
                <Textarea
                  id={`${group.id}-${key}`}
                  rows={6}
                  className="max-h-48"
                  value={(config[key] ?? []).join("\n")}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: lines(e.target.value) })
                  }
                />
              </div>
            ))
          ) : (
            <>
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
          {children}
          {save.error && (
            <p className="text-xs text-destructive">{save.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  deliveryGroupId: group.id,
                  configuration: config,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
