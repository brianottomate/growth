"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { parseSeedList, type SeedListParse } from "@/lib/seed-list";
import { orpc } from "@/orpc/client";
export type CampaignAsset = {
  id: string;
  name: string;
  externalId: string | null;
  source: string;
  type: string;
  sourceId: string | null;
  channel: { platform: string };
  linkedAudienceIds: string[];
  seedMetadata: {
    status: string;
    count: number;
    cleanupFailed?: boolean;
  } | null;
};
export function CampaignAudienceAssets({
  audienceId,
  assets,
  countries,
}: {
  audienceId: string;
  assets: CampaignAsset[];
  countries?: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [seedId, setSeedId] = useState("");
  const [country, setCountry] = useState(countries?.[0] ?? "US");
  const link = useMutation(orpc.ads.linkAudience.mutationOptions());
  const unlink = useMutation(orpc.ads.unlinkAudienceAsset.mutationOptions());
  const build = useMutation(orpc.ads.buildLookalike.mutationOptions());
  const usable = assets.filter(
    (a) =>
      a.channel.platform === "meta_ads" &&
      a.externalId &&
      (!a.seedMetadata || a.seedMetadata.status === "ready"),
  );
  const current = usable.find((a) => a.linkedAudienceIds.includes(audienceId));
  const seeds = usable.filter((a) => a.source === "customer_list");
  const chosenSeed =
    seeds.find((a) => a.id === seedId) ??
    seeds.find((a) => a.id === current?.id);
  const act = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Audience operation failed",
      );
    }
  };
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium">Reusable Meta audience</p>
      {current && (
        <p className="text-xs">
          Selected: {current.name}{" "}
          <Button
            size="sm"
            variant="ghost"
            disabled={unlink.isPending}
            onClick={() =>
              void act(() =>
                unlink.mutateAsync({ audienceId, platform: "meta_ads" }),
              )
            }
          >
            Unlink
          </Button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Existing Meta audience"
          className="min-w-0 flex-1 rounded-md border bg-background p-2 text-xs"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose an existing audience</option>
          {usable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected || link.isPending}
          onClick={() =>
            void act(() =>
              link.mutateAsync({ audienceId, platformAudienceId: selected }),
            )
          }
        >
          Use audience
        </Button>
      </div>
      <SeedUpload audienceId={audienceId} />
      {seeds.length > 0 && (
        <div className="space-y-2">
          <Label>
            Lookalike seed
            <select
              aria-label="Lookalike seed"
              className="mt-1 block w-full rounded-md border bg-background p-2 text-xs"
              value={chosenSeed?.id ?? ""}
              onChange={(e) => setSeedId(e.target.value)}
            >
              <option value="">Choose customer list</option>
              {seeds.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Label>
          <div className="flex items-end gap-2">
            <Label>
              Country
              <Input
                className="mt-1 w-20"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
            </Label>
            <Button
              size="sm"
              variant="outline"
              disabled={
                !chosenSeed || !/^[A-Z]{2}$/.test(country) || build.isPending
              }
              onClick={() =>
                void act(() =>
                  build.mutateAsync({
                    audienceId,
                    seedPlatformAudienceId: chosenSeed!.id,
                    country,
                    approved: true,
                  }),
                )
              }
            >
              {build.isPending
                ? "Creating…"
                : `Create 1% ${country} lookalike on Meta`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Creates and selects a new audience. Ads are not launched.
          </p>
        </div>
      )}
      {assets
        .filter((a) => a.seedMetadata?.status === "failed")
        .map((a) => (
          <p key={a.id} className="text-xs text-destructive">
            Failed upload: {a.name}.{" "}
            {a.seedMetadata?.cleanupFailed
              ? "Cleanup failed; remove the leftover audience in Meta before retrying."
              : "Retry the complete upload."}
          </p>
        ))}
    </div>
  );
}
function SeedUpload({ audienceId }: { audienceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"csv" | "bigquery">("csv");
  const [parsed, setParsed] = useState<SeedListParse | null>(null);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState(false);
  const [snapshotId, setSnapshotId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const prepare = useMutation(orpc.ads.prepareSeed.mutationOptions());
  const snapshot = useQuery({
    ...orpc.ads.seedSnapshot.queryOptions({
      input: { audienceId, snapshotId },
    }),
    enabled: open && Boolean(snapshotId),
    refetchInterval: (q) =>
      q.state.data?.status === "compiling" ? 2000 : false,
  });
  const count =
    source === "csv"
      ? (parsed?.members.length ?? 0)
      : (snapshot.data?.count ?? 0);
  const ready =
    source === "csv"
      ? count > 0
      : snapshot.data?.status === "ready" && count > 0;
  const upload = async () => {
    setUploading(true);
    setError("");
    try {
      const response = await fetch("/api/campaign-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceId,
          source,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(source === "csv" ? { users: parsed?.members } : { snapshotId }),
          permissionConfirmed: permission,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      setOpen(false);
      setParsed(null);
      setPermission(false);
      router.refresh();
      toast.success("Customer list uploaded and selected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      router.refresh();
    } finally {
      setUploading(false);
    }
  };
  return (
    <SimpleDialog
      title="Create a Meta customer list"
      description="Use your own CSV or a reviewed selection of past bookers from this brand’s linked WanderOS website."
      open={open}
      onOpenChange={(value) => {
        if (!uploading) {
          setOpen(value);
          if (value) {
            setPermission(false);
            setError("");
          }
        }
      }}
      trigger={
        <Button size="sm" variant="outline">
          Create customer list
        </Button>
      }
      footer={
        <Button
          disabled={!ready || !permission || uploading || count > 50000}
          onClick={() => void upload()}
        >
          {uploading
            ? "Uploading…"
            : `Upload ${count.toLocaleString()} people to Meta`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Label>
          Source
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as "csv" | "bigquery");
              setPermission(false);
            }}
          >
            <option value="csv">Custom CSV</option>
            <option value="bigquery">BigQuery · past bookers</option>
          </select>
        </Label>
        {source === "csv" ? (
          <>
            <Input
              aria-label="Customer CSV"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 8000000) {
                  setError("CSV must be smaller than 8 MB");
                  return;
                }
                setParsed(parseSeedList(await file.text()));
                setPermission(false);
              }}
            />
            {parsed && (
              <p className="text-sm">
                {count.toLocaleString()} people from{" "}
                {parsed.rows.toLocaleString()} rows ·{" "}
                {parsed.withEmail.toLocaleString()} emails ·{" "}
                {parsed.withPhone.toLocaleString()} phones
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Confirmed, uncancelled direct website bookers. Recipients stay in
              a private warehouse snapshot; Growth saves its reference and
              count.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={prepare.isPending || uploading}
              onClick={async () => {
                try {
                  setPermission(false);
                  setSnapshotId("");
                  const result = await prepare.mutateAsync({ audienceId });
                  setSnapshotId(result.snapshotId);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not prepare selection",
                  );
                }
              }}
            >
              {prepare.isPending
                ? "Preparing…"
                : "Prepare past-bookers selection"}
            </Button>
            {snapshotId && (
              <p className="text-sm">
                {snapshot.data?.status === "ready"
                  ? `${count.toLocaleString()} people ready for review`
                  : snapshot.data?.status === "failed"
                    ? "Warehouse selection failed. Prepare it again."
                    : "Compiling selection…"}
              </p>
            )}
            {snapshot.error && (
              <p role="alert" className="text-sm text-destructive">
                {snapshot.error.message}
              </p>
            )}
          </>
        )}
        <Label>
          Name on Meta (optional)
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={permission}
            onChange={(e) => setPermission(e.target.checked)}
          />
          I have permission to use this customer list for advertising and
          authorize sending its email/phone identifiers to Meta through Zernio.
        </label>
        <p className="text-xs text-muted-foreground">
          Customer rows and CSV files are not saved in Growth. A failed upload
          requires a complete retry. Maximum 50,000 people.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SimpleDialog>
  );
}
