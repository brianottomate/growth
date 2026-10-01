"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  COPY_LAB_MODELS,
  COPY_LAB_SURFACES,
  type CopyLabBrand,
  type CopyLabHome,
  type CopyLabRunResult,
  type CopyLabSurface,
  type CopyLabVariant,
} from "@/lib/copy-lab";

type Home = Omit<CopyLabHome, "photos"> & { photoCount: number };
type Preset = { id: string; label: string; text: string };
type Variant = CopyLabVariant & { id: string };
type Cell =
  | { status: "running" }
  | { status: "error"; error: string }
  | {
      status: "done";
      result: CopyLabRunResult;
      at: string;
      /** The variant as it was run, to flag a column edited since. */
      ran: string;
    };

const PRODUCTION: Variant = {
  id: "production",
  label: "Production",
  model: null,
  effort: null,
  defaultEffort: true,
  images: true,
  story: true,
  system: null,
  appendix: "",
};

const STORE = "copy-lab:v1";
const KEEP_CELLS = 80;

const settingsOf = ({ id: _id, label: _label, ...rest }: Variant) =>
  JSON.stringify(rest);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORE}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the lab still works for this session.
  }
}

/** A stable shuffle for blind mode, seeded by the selection. */
function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

export function CopyWorkbench(props: {
  snapshotAt: string;
  brands: CopyLabBrand[];
  homes: Home[];
  presets: Preset[];
}) {
  const [surface, setSurface] = useState<CopyLabSurface>("catalog-card");
  const [brandId, setBrandId] = useState(props.brands[0]!.id);
  const [homeIds, setHomeIds] = useState<string[]>(() =>
    props.homes
      .filter((h) => h.brandId === props.brands[0]!.id)
      .map((h) => h.id),
  );
  const [variants, setVariants] = useState<Variant[]>([PRODUCTION]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [blind, setBlind] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setVariants(load("variants", [PRODUCTION]));
    setCells(load("cells", {}));
    setPicks(load("picks", {}));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) save("variants", variants);
  }, [variants, loaded]);
  useEffect(() => {
    if (loaded) save("picks", picks);
  }, [picks, loaded]);
  useEffect(() => {
    if (!loaded) return;
    // The prompts are large and come back with every run: keep the outputs.
    const done = Object.entries(cells)
      .filter(([, cell]) => cell.status === "done")
      .slice(-KEEP_CELLS)
      .map(([key, cell]) => [
        key,
        cell.status === "done"
          ? { ...cell, result: { ...cell.result, system: "", baseSystem: "" } }
          : cell,
      ]);
    save("cells", Object.fromEntries(done));
  }, [cells, loaded]);

  const spec = COPY_LAB_SURFACES.find((s) => s.id === surface)!;
  const brand = props.brands.find((b) => b.id === brandId)!;
  const brandHomes = props.homes.filter((h) => h.brandId === brandId);
  const selected =
    spec.homes === "none"
      ? []
      : spec.homes === "one"
        ? homeIds.slice(0, 1)
        : homeIds;
  const selection = `${surface}|${brandId}|${selected.join(",")}`;
  const columns = useMemo(
    () =>
      blind
        ? [...variants].sort(
            (a, b) => hash(selection + a.id) - hash(selection + b.id),
          )
        : variants,
    [blind, variants, selection],
  );
  const production = Object.entries(cells)
    .flatMap(([key, cell]) =>
      key.startsWith(`${surface}|`) &&
      cell.status === "done" &&
      cell.result.baseSystem
        ? [cell.result.baseSystem]
        : [],
    )
    .at(-1);

  const chooseBrand = (id: string) => {
    setBrandId(id);
    setHomeIds(props.homes.filter((h) => h.brandId === id).map((h) => h.id));
  };
  const toggleHome = (id: string) =>
    setHomeIds((ids) =>
      spec.homes === "one"
        ? [id, ...ids.filter((x) => x !== id)]
        : ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id],
    );
  const update = (id: string, patch: Partial<Variant>) =>
    setVariants((list) =>
      list.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  const duplicate = (variant: Variant) =>
    setVariants((list) => [
      ...list,
      {
        ...variant,
        id: crypto.randomUUID(),
        label: `${variant.label} copy`.slice(0, 40),
      },
    ]);

  async function run(variant: Variant) {
    const key = `${selection}|${variant.id}`;
    setCells((c) => ({ ...c, [key]: { status: "running" } }));
    const { id: _id, ...body } = variant;
    try {
      const res = await fetch("/api/lab/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          brandId,
          homeIds: selected,
          variant: body,
        }),
      });
      const json = (await res.json()) as CopyLabRunResult & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? res.statusText);
      setCells((c) => ({
        ...c,
        [key]: {
          status: "done",
          result: json,
          at: new Date().toISOString(),
          ran: settingsOf(variant),
        },
      }));
    } catch (error) {
      setCells((c) => ({
        ...c,
        [key]: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  const exportRuns = () => {
    const blob = new Blob(
      [JSON.stringify({ variants, cells, picks }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `copy-lab-${new Date().toISOString().slice(0, 16)}.json`;
    a.click();
  };

  const canRun = spec.homes === "none" || selected.length > 0;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Copy lab</h1>
          <p className="text-xs text-muted-foreground">
            Fixtures from {props.snapshotAt.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={blind} onCheckedChange={setBlind} />
            Blind
          </label>
          <Button variant="outline" size="sm" onClick={exportRuns}>
            Export JSON
          </Button>
          <Button
            size="sm"
            disabled={!canRun}
            onClick={() => variants.forEach((v) => void run(v))}
          >
            Run all
          </Button>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {COPY_LAB_SURFACES.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={s.id === surface ? "default" : "outline"}
              onClick={() => setSurface(s.id)}
              title={s.note}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {props.brands.map((b) => (
            <Button
              key={b.id}
              size="xs"
              variant={b.id === brandId ? "secondary" : "ghost"}
              onClick={() => chooseBrand(b.id)}
            >
              {b.name}
              {!b.story && (
                <span className="text-muted-foreground">· no story</span>
              )}
            </Button>
          ))}
        </div>
        {spec.homes !== "none" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {brandHomes.map((home) => {
              const on = selected.includes(home.id);
              return (
                <button
                  key={home.id}
                  type="button"
                  onClick={() => toggleHome(home.id)}
                  className={`flex items-center gap-3 rounded-md border p-2 text-left text-sm ${on ? "border-primary bg-primary/5" : "opacity-60"}`}
                >
                  {home.heroUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={home.heroUrl}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {home.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        home.bedrooms && `${home.bedrooms} bd`,
                        home.guests && `sleeps ${home.guests}`,
                        `${home.photoCount} photos`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {brand.story && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Brand story
            </summary>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap">{brand.story}</p>
          </details>
        )}
      </section>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {surface === "catalog-card" && selected[0] && (
          <HumanColumn home={props.homes.find((h) => h.id === selected[0])!} />
        )}
        {columns.map((variant, index) => {
          const cell = cells[`${selection}|${variant.id}`];
          const pick = picks[selection];
          const reveal = !blind || Boolean(pick);
          return (
            <div
              key={variant.id}
              className={`w-[380px] shrink-0 space-y-3 rounded-lg border p-3 ${pick === variant.id ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {reveal ? variant.label : `Option ${index + 1}`}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant={pick === variant.id ? "default" : "outline"}
                    onClick={() =>
                      setPicks((p) => ({ ...p, [selection]: variant.id }))
                    }
                  >
                    Prefer
                  </Button>
                  <Button
                    size="xs"
                    disabled={!canRun || cell?.status === "running"}
                    onClick={() => void run(variant)}
                  >
                    {cell?.status === "running" ? "Running" : "Run"}
                  </Button>
                </div>
              </div>
              {!blind && (
                <VariantEditor
                  variant={variant}
                  presets={props.presets}
                  production={production ?? null}
                  onChange={(patch) => update(variant.id, patch)}
                  onDuplicate={() => duplicate(variant)}
                  onRemove={
                    variants.length > 1
                      ? () =>
                          setVariants((list) =>
                            list.filter((v) => v.id !== variant.id),
                          )
                      : undefined
                  }
                />
              )}
              <CellView
                cell={cell}
                surface={surface}
                homes={selected.map((id) =>
                  props.homes.find((h) => h.id === id)!,
                )}
                stale={
                  cell?.status === "done" && cell.ran !== settingsOf(variant)
                }
                reveal={reveal}
              />
            </div>
          );
        })}
        {!blind && (
          <button
            type="button"
            onClick={() => duplicate(variants.at(-1) ?? PRODUCTION)}
            className="w-40 shrink-0 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground"
          >
            + Variant
          </button>
        )}
      </div>
    </div>
  );
}

function VariantEditor(props: {
  variant: Variant;
  presets: Preset[];
  production: string | null;
  onChange: (patch: Partial<Variant>) => void;
  onDuplicate: () => void;
  onRemove?: () => void;
}) {
  const { variant, onChange } = props;
  const summary = [
    variant.model ?? "production model",
    variant.defaultEffort ? null : `effort ${variant.effort ?? "off"}`,
    variant.images ? null : "no photos",
    variant.story ? null : "no story",
    variant.appendix.trim() ? "+ appendix" : null,
    variant.system === null ? null : "custom prompt",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer truncate text-xs text-muted-foreground">
        {summary}
      </summary>
      <div className="mt-2 space-y-2">
        <input
          value={variant.label}
          maxLength={40}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full rounded-md border bg-background px-2 py-1"
          aria-label="Variant name"
        />
        <div className="grid grid-cols-2 gap-2">
          <SimpleSelect
            size="sm"
            aria-label="Model"
            value={variant.model ?? "default"}
            onValueChange={(v) =>
              onChange({ model: v === "default" ? null : v })
            }
            options={[
              { value: "default", label: "Production model" },
              ...COPY_LAB_MODELS.map((m) => ({ value: m, label: m })),
            ]}
          />
          <SimpleSelect
            size="sm"
            aria-label="Effort"
            value={
              variant.defaultEffort ? "default" : (variant.effort ?? "off")
            }
            onValueChange={(v) =>
              onChange(
                v === "default"
                  ? { defaultEffort: true, effort: null }
                  : {
                      defaultEffort: false,
                      effort: v === "off" ? null : (v as Variant["effort"]),
                    },
              )
            }
            options={[
              { value: "default", label: "Production effort" },
              { value: "off", label: "No effort setting" },
              { value: "low", label: "Effort low" },
              { value: "medium", label: "Effort medium" },
              { value: "high", label: "Effort high" },
            ]}
          />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <Switch
              checked={variant.images}
              onCheckedChange={(images) => onChange({ images })}
            />
            Photos
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={variant.story}
              onCheckedChange={(story) => onChange({ story })}
            />
            Brand story
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {props.presets.map((preset) => (
            <Button
              key={preset.id}
              size="xs"
              variant="ghost"
              onClick={() =>
                onChange({
                  appendix: [variant.appendix.trim(), preset.text]
                    .filter(Boolean)
                    .join("\n\n"),
                })
              }
            >
              + {preset.label}
            </Button>
          ))}
        </div>
        <Textarea
          value={variant.appendix}
          onChange={(e) => onChange({ appendix: e.target.value })}
          placeholder="Appended to the system prompt: a steer, a voice rule"
          className="max-h-40 min-h-16 text-xs"
        />
        <details open={variant.system !== null}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {variant.system === null
              ? "Production system prompt"
              : "Custom system prompt"}
          </summary>
          {variant.system === null ? (
            <Button
              size="xs"
              variant="outline"
              className="mt-2"
              disabled={!props.production}
              onClick={() => onChange({ system: props.production })}
            >
              {props.production ? "Edit a copy" : "Run once to load it"}
            </Button>
          ) : (
            <div className="mt-2 space-y-1">
              <Textarea
                value={variant.system}
                onChange={(e) => onChange({ system: e.target.value })}
                className="max-h-96 min-h-64 font-mono text-[11px]"
              />
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onChange({ system: null })}
              >
                Back to production
              </Button>
            </div>
          )}
        </details>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={props.onDuplicate}>
            Duplicate
          </Button>
          {props.onRemove && (
            <Button
              size="xs"
              variant="ghost"
              tone="muted-danger"
              onClick={props.onRemove}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

function HumanColumn({ home }: { home: Home }) {
  return (
    <div className="w-[300px] shrink-0 space-y-3 rounded-lg border border-dashed p-3">
      <span className="font-medium">On the catalog now</span>
      {home.heroUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={home.heroUrl}
          alt=""
          className="aspect-[4/5] w-full rounded object-cover"
        />
      )}
      <p className="text-lg leading-snug font-semibold">
        {home.catalog.title ?? "No headline yet"}
      </p>
      {home.catalog.approved && <Badge variant="secondary">Approved</Badge>}
      {home.catalog.pills?.length ? <Pills pills={home.catalog.pills} /> : null}
    </div>
  );
}

function Pills({ pills }: { pills: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((pill) => (
        <Badge key={pill} variant="outline">
          {pill}
        </Badge>
      ))}
    </div>
  );
}

function CellView(props: {
  cell: Cell | undefined;
  surface: CopyLabSurface;
  homes: Home[];
  stale: boolean;
  reveal: boolean;
}) {
  const { cell } = props;
  if (!cell) return <p className="text-sm text-muted-foreground">Not run</p>;
  if (cell.status === "running")
    return <p className="text-sm text-muted-foreground">Writing…</p>;
  if (cell.status === "error")
    return <p className="text-sm text-destructive">{cell.error}</p>;
  const { result } = cell;
  return (
    <div className="space-y-3">
      {props.reveal && (
        <p className="text-xs text-muted-foreground">
          {result.model} · {(result.ms / 1000).toFixed(1)}s ·{" "}
          {result.usage.inputTokens.toLocaleString()} in /{" "}
          {result.usage.outputTokens.toLocaleString()} out
          {props.stale && " · edited since this run"}
        </p>
      )}
      {result.problems.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          Rewrote after: {result.problems.join(" / ")}
        </div>
      )}
      {result.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.flags.map((flag) => (
            <Badge key={flag} variant="destructive" textSize="caption">
              {flag}
            </Badge>
          ))}
        </div>
      )}
      {result.output === null ? (
        <p className="text-sm text-destructive">No usable copy</p>
      ) : props.surface === "catalog-card" ? (
        <CatalogOutput
          output={result.output as CatalogOut}
          home={props.homes[0]}
        />
      ) : props.surface === "meta-set" ? (
        <MetaSetOutput
          output={result.output as MetaSetOut}
          homes={props.homes}
        />
      ) : (
        <ConceptsOutput output={result.output as ConceptsOut} />
      )}
      {result.system && props.reveal && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            System prompt sent
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap">
            {result.system}
          </pre>
        </details>
      )}
    </div>
  );
}

type CatalogOut = {
  headline: string;
  pills: string[];
  reason: string;
  showPhoto: { number: number; url: string } | null;
};
type MetaHomeOut = {
  primaryText: string;
  headline: string;
  description: string;
  cardTitle: string;
};
type MetaSetOut = {
  homes: MetaHomeOut[];
  portfolioPrimaryText: string;
  portfolioHeadline: string;
  portfolioDescription: string;
};
type ConceptsOut = {
  ideas: {
    name: string;
    format: string;
    headline: string;
    body: string;
    description: string;
  }[];
};

function CatalogOutput({ output, home }: { output: CatalogOut; home?: Home }) {
  const photo = output.showPhoto?.url ?? home?.heroUrl;
  return (
    <div className="space-y-2">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="aspect-[4/5] w-full rounded object-cover"
        />
      )}
      <p className="text-lg leading-snug font-semibold">{output.headline}</p>
      {output.pills.length > 0 && <Pills pills={output.pills} />}
      {output.showPhoto && (
        <p className="text-xs text-muted-foreground">
          Swapped to photo {output.showPhoto.number}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{output.reason}</p>
    </div>
  );
}

function AdBlock(props: {
  heroUrl?: string | null;
  cardTitle?: string;
  primaryText: string;
  headline: string;
  description: string;
}) {
  return (
    <div className="space-y-2 rounded-md border p-2 text-sm">
      <p className="whitespace-pre-wrap">{props.primaryText}</p>
      {props.heroUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={props.heroUrl}
            alt=""
            className="aspect-square w-full rounded object-cover"
          />
          {props.cardTitle && (
            <span className="absolute inset-x-2 bottom-2 rounded bg-black/55 px-2 py-1 text-base font-semibold text-white">
              {props.cardTitle}
            </span>
          )}
        </div>
      )}
      <div>
        <p className="font-semibold">{props.headline}</p>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}

function MetaSetOutput({
  output,
  homes,
}: {
  output: MetaSetOut;
  homes: Home[];
}) {
  return (
    <div className="space-y-3">
      {output.homes.map((copy, i) => (
        <AdBlock key={i} heroUrl={homes[i]?.heroUrl} {...copy} />
      ))}
      <p className="text-xs font-medium text-muted-foreground uppercase">
        Portfolio
      </p>
      <AdBlock
        primaryText={output.portfolioPrimaryText}
        headline={output.portfolioHeadline}
        description={output.portfolioDescription}
      />
    </div>
  );
}

function ConceptsOutput({ output }: { output: ConceptsOut }) {
  return (
    <div className="space-y-3">
      {output.ideas.map((idea, i) => (
        <div key={i} className="space-y-1 rounded-md border p-2 text-sm">
          <p className="text-xs text-muted-foreground">
            {idea.name} · {idea.format}
          </p>
          <p className="whitespace-pre-wrap">{idea.body}</p>
          <p className="font-semibold">{idea.headline}</p>
          <p className="text-xs text-muted-foreground">{idea.description}</p>
        </div>
      ))}
    </div>
  );
}
