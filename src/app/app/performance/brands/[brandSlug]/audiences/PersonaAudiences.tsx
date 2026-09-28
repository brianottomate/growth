"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, RefreshCw, Upload, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DefinePersonasButton } from "@/app/app/brands/[brandSlug]/ads/DefinePersonasButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/components/ui/lib/utils";
import { parseSeedList, type SeedListParse } from "@/lib/seed-list";
import { orpc } from "@/orpc/client";

// The section's label and tile shapes. `_components` exports them too, but it
// imports server services, so a client component cannot pull it in.
const label =
  "text-[10.5px] font-semibold tracking-[0.09em] uppercase text-muted-foreground";
const tile = "bg-muted/40 rounded-xl border px-3 py-2.5";

type Asset = {
  id: string;
  name: string;
  type: string;
  source: string;
  sizeLabel: string | null;
  externalId: string | null;
  platform: string;
};

type PersonaRow = {
  id: string;
  name: string;
  description: string | null;
  countries: string[];
  targets: { asset: Asset; seed: Asset | null }[];
};

const DEFAULT_COUNTRY = "US";

const PLATFORM_LABEL: Record<string, string> = {
  meta_ads: "Meta",
  google_ads: "Google",
  linkedin_ads: "LinkedIn",
};

function assetKind(asset: Asset) {
  if (asset.type === "lookalike") return "Lookalike";
  if (asset.source === "customer_list") return "Customer list";
  return "Custom audience";
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function PersonaAudiences({
  brand,
  personas,
  unassigned,
}: {
  brand: { id: string; slug: string; name: string };
  personas: PersonaRow[];
  unassigned: Asset[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const refresh = useMutation(
    orpc.ads.pullAudiences.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={label}>Personas · {personas.length}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate({ brandSlug: brand.slug })}
          >
            <RefreshCw
              className={cn("size-3.5", refresh.isPending && "animate-spin")}
            />
            Refresh from Meta
          </Button>
          <DefinePersonasButton brandId={brand.id} brandName={brand.name} />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            New persona
          </Button>
        </div>
      </div>
      {refresh.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorText(refresh.error)}
        </p>
      ) : null}

      {personas.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Add the first persona"
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              New persona
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {personas.map((persona) => (
            <PersonaCard key={persona.id} persona={persona} />
          ))}
        </div>
      )}

      {unassigned.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <span className={label}>
              In the ad account · {unassigned.length}
            </span>
          </summary>
          <ul className="mt-2 divide-y rounded-xl border">
            {unassigned.map((asset) => (
              <UnassignedRow key={asset.id} asset={asset} personas={personas} />
            ))}
          </ul>
        </details>
      ) : null}

      <NewPersonaDialog
        brandId={brand.id}
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  );
}

function PersonaCard({ persona }: { persona: PersonaRow }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<SeedListParse | null>(null);
  const [fileName, setFileName] = useState("");
  const country = persona.countries[0] ?? DEFAULT_COUNTRY;
  const lookalike = useMutation(
    orpc.persona.createLookalike.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <div className={cn(tile, "space-y-3 py-3")}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{persona.name}</h3>
          <span className="text-xs text-muted-foreground">
            {persona.countries.length ? persona.countries.join(", ") : country}
          </span>
        </div>
        {persona.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {persona.description}
          </p>
        ) : null}
      </div>

      {persona.targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Upload a customer list to seed a lookalike.
        </p>
      ) : (
        <ul className="space-y-2">
          {persona.targets.map(({ asset, seed }) => (
            <li
              key={asset.id}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{asset.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {PLATFORM_LABEL[asset.platform] ?? asset.platform}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {assetKind(asset)}
                {asset.sizeLabel ? ` · ${asset.sizeLabel}` : ""}
                {seed ? ` · from ${seed.name}` : ""}
              </div>
              {asset.source === "customer_list" &&
              asset.platform === "meta_ads" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={lookalike.isPending || !asset.externalId}
                  onClick={() =>
                    lookalike.mutate({
                      seedPlatformAudienceId: asset.id,
                      personaId: persona.id,
                      ratio: 0.01,
                      country,
                    })
                  }
                >
                  {lookalike.isPending
                    ? "Creating…"
                    : `Build 1% ${country} lookalike`}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {lookalike.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorText(lookalike.error)}
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setFileName(file.name);
          setParsed(parseSeedList(await file.text()));
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-3.5" />
        Upload seed list
      </Button>

      <UploadDialog
        persona={persona}
        fileName={fileName}
        parsed={parsed}
        onClose={() => setParsed(null)}
      />
    </div>
  );
}

function UploadDialog({
  persona,
  fileName,
  parsed,
  onClose,
}: {
  persona: PersonaRow;
  fileName: string;
  parsed: SeedListParse | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const upload = useMutation(
    orpc.persona.uploadSeedList.mutationOptions({
      onSuccess: () => {
        setName("");
        onClose();
        router.refresh();
      },
    }),
  );
  const members = parsed?.members ?? [];

  return (
    <Dialog
      open={parsed !== null}
      onOpenChange={(open) => {
        if (!open && !upload.isPending) {
          upload.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seed list for {persona.name}</DialogTitle>
        </DialogHeader>
        {parsed ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">File</dt>
              <dd className="truncate">{fileName}</dd>
              <dt className="text-muted-foreground">People</dt>
              <dd>
                {members.length.toLocaleString()} of{" "}
                {parsed.rows.toLocaleString()} rows
              </dd>
              <dt className="text-muted-foreground">Emails</dt>
              <dd>
                {parsed.withEmail.toLocaleString()}
                {parsed.emailColumn ? ` · "${parsed.emailColumn}"` : ""}
              </dd>
              <dt className="text-muted-foreground">Phones</dt>
              <dd>
                {parsed.withPhone.toLocaleString()}
                {parsed.phoneColumn ? ` · "${parsed.phoneColumn}"` : ""}
              </dd>
            </dl>
            {members.length === 0 ? (
              <p role="alert" className="text-destructive">
                No email or phone column found.
              </p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="seed-name">Name on Meta</Label>
              <Input
                id="seed-name"
                value={name}
                placeholder={`${persona.name} · seed`}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {upload.error ? (
              <p role="alert" className="text-destructive">
                {errorText(upload.error)}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={members.length === 0 || upload.isPending}
            onClick={() =>
              upload.mutate({
                personaId: persona.id,
                users: members,
                ...(name.trim() ? { name: name.trim() } : {}),
              })
            }
          >
            {upload.isPending
              ? "Uploading…"
              : `Upload ${members.length.toLocaleString()} to Meta`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnassignedRow({
  asset,
  personas,
}: {
  asset: Asset;
  personas: PersonaRow[];
}) {
  const router = useRouter();
  const assign = useMutation(
    orpc.persona.assignAudience.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate">{asset.name}</div>
        <div className="text-xs text-muted-foreground">
          {PLATFORM_LABEL[asset.platform] ?? asset.platform} ·{" "}
          {assetKind(asset)}
          {asset.sizeLabel ? ` · ${asset.sizeLabel}` : ""}
        </div>
        {assign.error ? (
          <p role="alert" className="text-xs text-destructive">
            {errorText(assign.error)}
          </p>
        ) : null}
      </div>
      {personas.length > 0 ? (
        <SimpleSelect
          size="sm"
          className="w-48"
          placeholder="Use for persona"
          aria-label={`Use ${asset.name} for a persona`}
          disabled={assign.isPending}
          options={personas.map((persona) => ({
            value: persona.id,
            label: persona.name,
          }))}
          onValueChange={(personaId) =>
            assign.mutate({ platformAudienceId: asset.id, personaId })
          }
        />
      ) : null}
    </li>
  );
}

function NewPersonaDialog({
  brandId,
  open,
  onOpenChange,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const create = useMutation(
    orpc.persona.create.mutationOptions({
      onSuccess: () => {
        setName("");
        setDescription("");
        setCountry(DEFAULT_COUNTRY);
        onOpenChange(false);
        router.refresh();
      },
    }),
  );
  const code = country.trim().toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New persona</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              brandId,
              name: name.trim(),
              description: description.trim() || null,
              demandGeography: code.length === 2 ? { countries: [code] } : null,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="persona-name">Name</Label>
            <Input
              id="persona-name"
              value={name}
              placeholder="Past guests of similar homes"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="persona-description">Description</Label>
            <Input
              id="persona-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="persona-country">Guests come from (country)</Label>
            <Input
              id="persona-country"
              value={country}
              maxLength={2}
              className="w-20"
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
            />
          </div>
          {create.error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorText(create.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create persona"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
