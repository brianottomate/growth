"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { useTRPC } from "@/trpc/react";

/**
 * Map one owned brand to one Zernio profile; its connected accounts become
 * workspace channels. Controlled dialog — the trigger lives in BrandMenu.
 */
export function ZernioConnectDialog({
  brandId,
  currentProfileId,
  open,
  onOpenChange,
}: {
  brandId: string;
  currentProfileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [profileId, setProfileId] = useState(currentProfileId ?? "");
  const [error, setError] = useState<string | null>(null);

  const catalogQ = useQuery({
    ...trpc.zernio.catalog.queryOptions(),
    enabled: open,
  });
  const catalog = catalogQ.data;
  const selected = catalog?.profiles.find(
    (profile) => profile.id === profileId,
  );

  useEffect(() => {
    if (!open) return;
    if (currentProfileId) {
      setProfileId(currentProfileId);
      return;
    }
    if (!profileId && catalog?.profiles.length === 1) {
      setProfileId(catalog.profiles[0]!.id);
    }
  }, [catalog?.profiles, currentProfileId, open, profileId]);

  const connectM = useMutation(
    trpc.zernio.connectProfile.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        setError(null);
        router.refresh();
      },
      onError: (mutationError) => setError(mutationError.message),
    }),
  );

  const submit = () => {
    if (!profileId) return;
    setError(null);
    connectM.mutate({ brandId, profileId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Zernio profile</DialogTitle>
          <DialogDescription>
            One owned brand maps to one Zernio profile. Its connected accounts
            become workspace channels automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {catalogQ.isLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading Zernio profiles…
            </p>
          ) : !catalog?.configured ? (
            <p className="text-destructive text-sm">
              Zernio is not configured.
            </p>
          ) : catalog.profiles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No profiles exist in the connected Zernio workspace.
            </p>
          ) : (
            <>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Zernio profile" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.profiles.map((profile) => {
                    const assignedElsewhere = Boolean(
                      profile.assignedBrand &&
                      profile.assignedBrand.id !== brandId,
                    );
                    return (
                      <SelectItem
                        key={profile.id}
                        value={profile.id}
                        disabled={assignedElsewhere}
                      >
                        {profile.name} · {profile.accounts.length} account
                        {profile.accounts.length === 1 ? "" : "s"}
                        {assignedElsewhere
                          ? ` · assigned to ${profile.assignedBrand!.name}`
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selected && (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{selected.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {selected.accounts.length} connected
                    </span>
                  </div>
                  {selected.accounts.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      This profile has no connected accounts yet. You can still
                      assign it now and refresh after connecting accounts in
                      Zernio.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selected.accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <ChannelLogo platform={account.platform} />
                          <span className="font-medium">
                            {platformLabel(account.platform)}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {account.username ??
                              account.displayName ??
                              "Connected account"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(error || catalogQ.error) && (
            <p className="text-destructive text-sm">
              {error ?? catalogQ.error?.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            loading={connectM.isPending}
            disabled={!profileId || !catalog?.configured}
            className="gap-1.5"
          >
            {currentProfileId ? <RefreshCw className="size-3.5" /> : null}
            {currentProfileId ? "Refresh accounts" : "Connect profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
