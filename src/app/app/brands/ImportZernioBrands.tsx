"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { orpc } from "@/orpc/client";

type BrandType = "company" | "personal";

export function ImportZernioBrands() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [types, setTypes] = useState<Record<string, BrandType>>({});
  const [error, setError] = useState<string | null>(null);

  const catalogQ = useQuery({
    ...orpc.zernio.catalog.queryOptions(),
    enabled: open,
  });
  const profiles = useMemo(
    () => catalogQ.data?.profiles ?? [],
    [catalogQ.data?.profiles],
  );
  const available = useMemo(
    () => profiles.filter((profile) => !profile.assignedBrand),
    [profiles],
  );

  useEffect(() => {
    if (!open || profiles.length === 0) return;
    setTypes((current) => {
      const next = { ...current };
      for (const profile of profiles) {
        next[profile.id] ??= /kristian|personal/i.test(profile.name)
          ? "personal"
          : "company";
      }
      return next;
    });
  }, [open, profiles]);

  const importM = useMutation(
    orpc.zernio.importProfiles.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setSelected([]);
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => setError(mutationError.message),
    }),
  );

  const toggle = (profileId: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, profileId])]
        : current.filter((id) => id !== profileId),
    );

  const submit = () =>
    importM.mutate({
      profiles: selected.map((profileId) => ({
        profileId,
        brandType: types[profileId] ?? "company",
      })),
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"

        onClick={() => setOpen(true)}
      >
        <Download className="size-3.5" />
        Import from Zernio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" scrollable>
          <DialogHeader>
            <DialogTitle>Import brands from Zernio</DialogTitle>
            <DialogDescription>
              Choose workspace profiles to create as owned workspace brands.
              Every connected account will be imported as its exact channel.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {catalogQ.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading workspace…
              </p>
            ) : !catalogQ.data?.configured ? (
              <p className="text-sm text-destructive">
                Zernio is not configured.
              </p>
            ) : profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Zernio profiles found.
              </p>
            ) : (
              profiles.map((profile) => {
                const isSelected = selected.includes(profile.id);
                const imported = profile.assignedBrand;
                return (
                  <div key={profile.id} className="rounded-xl border p-4">
                    <div className="flex items-start gap-3">
                      {imported ? (
                        <CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />
                      ) : (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            toggle(profile.id, checked === true)
                          }
                          aria-label={`Import ${profile.name}`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{profile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {profile.accounts.length} account
                            {profile.accounts.length === 1 ? "" : "s"}
                          </span>
                          {imported && (
                            <span className="text-xs text-muted-foreground">
                              Imported as {imported.name}
                            </span>
                          )}
                        </div>
                        {profile.accounts.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {profile.accounts.map((account) => (
                              <span
                                key={account.id}
                                className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                              >
                                <ChannelLogo platform={account.platform} />
                                {platformLabel(account.platform)}
                                <span className="text-muted-foreground">
                                  {account.username ?? account.displayName}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            No accounts connected yet; the profile can still be
                            imported.
                          </p>
                        )}
                      </div>
                      {!imported && (
                        <Select
                          value={types[profile.id] ?? "company"}
                          onValueChange={(value) =>
                            setTypes((current) => ({
                              ...current,
                              [profile.id]: value as BrandType,
                            }))
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company">Company</SelectItem>
                            <SelectItem value="personal">Personal</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {available.length === 0 && profiles.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Every Zernio profile is already represented in the workspace.
              </p>
            )}
            {(error || catalogQ.error) && (
              <p className="text-sm text-destructive">
                {error ?? catalogQ.error?.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"

              onClick={submit}
              loading={importM.isPending}
              disabled={selected.length === 0}
            >
              <PlugZap className="size-3.5" />
              Import {selected.length || "selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
