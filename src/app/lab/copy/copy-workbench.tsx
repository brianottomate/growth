"use client";

import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  COPY_LAB_MODELS,
  type CopyLabInspiration,
  copyLabInspirationSchema,
  copyLabExperimentSchema,
  COPY_LAB_PLACEMENTS,
  fixtureHomeSuite,
  mergeCopyLabSuite,
  type CopyLabAction,
  copyLabHistorySchema,
  type CopyLabHomeSuite,
  COPY_LAB_SURFACES,
  type CopyLabBrand,
  type CopyLabHome,
  type CopyLabRunResult,
  type CopyLabSurface,
  type CopyLabVariant,
} from "@/lib/copy-lab";

import { META_PLACEMENTS, type MetaPlacement } from "@/lib/meta-placement-plan";
import {
  CATALOG_TEMPLATES,
  DEFAULT_CATALOG_TEMPLATE,
  type CatalogTemplateId,
} from "@/lib/catalog-studio";
import { COMPOSITION_TEMPLATES } from "@/lib/compositions";
import { HomeSuite, CatalogArtwork, CompositionGuide } from "./home-suite";
import { RunIdeas } from "./run-ideas";
import { RunReview } from "./run-review";
import { PromptInspector } from "./prompt-inspector";
import { HomePicker } from "@/app/app/performance/clients/[brandSlug]/HomePicker";

type RunRecord = {
  id: string;
  selection: string;
  brandId: string;
  homeId: string;
  photoUrl?: string;
  action: CopyLabAction;
  variant: Variant;
  at: string;
  result: CopyLabRunResult;
};

type Home = CopyLabHome & { photoCount: number };
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
const KEEP_CELLS = 20;

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
  promptBases: Record<
    string,
    {
      withStory: { ad: string; photo: string };
      withoutStory: { ad: string; photo: string };
    }
  >;

  snapshotAt: string;
  brands: CopyLabBrand[];
  homes: Home[];
  presets: Preset[];
}) {
  const [surface, setSurface] = useState<CopyLabSurface>("home-suite");
  const [brandId, setBrandId] = useState(
    props.brands.find((b) => b.id === "hollyhock-suites")?.id ??
      props.brands[0]!.id,
  );
  const [homeIds, setHomeIds] = useState<string[]>(() =>
    props.homes
      .filter(
        (h) =>
          h.brandId ===
          (props.brands.find((b) => b.id === "hollyhock-suites")?.id ??
            props.brands[0]!.id),
      )
      .map((h) => h.id),
  );
  const [activeSet, setActiveSet] = useState("production");
  const [variants, setVariants] = useState<Variant[]>([PRODUCTION]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [showSource, setShowSource] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [catalogTemplates, setCatalogTemplates] = useState<CatalogTemplateId[]>(
    [DEFAULT_CATALOG_TEMPLATE, "catalog-amenities-place"],
  );
  const [photo, setPhoto] = useState<string | null>(null);
  const [placements, setPlacements] =
    useState<MetaPlacement[]>(COPY_LAB_PLACEMENTS);
  const [placement, setPlacement] = useState<MetaPlacement>("facebook-feed");
  const [blind, setBlind] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [inspiration, setInspiration] = useState<CopyLabInspiration>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const board = copyLabInspirationSchema.safeParse(load("inspiration", []));
    if (board.success) setInspiration(board.data);
    setVariants(load("variants", [PRODUCTION]));
    setActiveSet(load("activeSet", "production"));
    setCells(load("cells", {}));
    const savedHistory = copyLabHistorySchema.safeParse(
      load("run-history", []),
    );
    if (savedHistory.success) setHistory(savedHistory.data);
    setPicks(load("picks", {}));
    const context = load<null | {
      surface: CopyLabSurface;
      brandId: string;
      homeIds: string[];
      catalogTemplates: CatalogTemplateId[];
      photo: string | null;
      placements: MetaPlacement[];
      placement: MetaPlacement;
    }>("context", null);
    if (context && props.brands.some((b) => b.id === context.brandId)) {
      setSurface(context.surface);
      setBrandId(context.brandId);
      setHomeIds(context.homeIds);
      setCatalogTemplates(context.catalogTemplates);
      setPhoto(context.photo);
      setPlacements(context.placements);
      setPlacement(context.placement);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) save("variants", variants);
  }, [variants, loaded]);
  useEffect(() => {
    if (loaded) save("run-history", history);
  }, [history, loaded]);
  useEffect(() => {
    if (loaded) save("picks", picks);
  }, [picks, loaded]);
  useEffect(() => {
    if (!loaded) return;
    // Keep the prompt alongside each result so a reopened experiment is reviewable.
    const done = Object.entries(cells)
      .flatMap(([key, cell]) =>
        cell.status === "done" ? [[key, cell] as const] : [],
      )
      .sort(([, a], [, b]) => a.at.localeCompare(b.at))
      .slice(-KEEP_CELLS);
    save("cells", Object.fromEntries(done));
  }, [cells, loaded]);

  useEffect(() => {
    if (loaded)
      save("context", {
        surface,
        brandId,
        homeIds,
        catalogTemplates,
        photo,
        placements,
        placement,
      });
  }, [
    loaded,
    surface,
    brandId,
    homeIds,
    catalogTemplates,
    photo,
    placements,
    placement,
  ]);

  useEffect(() => {
    if (loaded) save("inspiration", inspiration);
  }, [loaded, inspiration]);

  useEffect(() => {
    if (loaded) save("activeSet", activeSet);
  }, [loaded, activeSet]);

  const spec = COPY_LAB_SURFACES.find((s) => s.id === surface)!;
  const brand = props.brands.find((b) => b.id === brandId)!;
  const brandHomes = props.homes.filter((h) => h.brandId === brandId);
  const selected =
    spec.homes === "none"
      ? []
      : spec.homes === "one"
        ? homeIds.slice(0, 1)
        : homeIds;
  const selectedHome = props.homes.find((h) => h.id === selected[0]);
  const photoUrl =
    photo && selectedHome?.photos.some((p) => p.url === photo)
      ? photo
      : (selectedHome?.heroUrl ?? selectedHome?.photos[0]?.url);
  const selection = `${surface}|${brandId}|${selected.join(",")}${surface === "home-suite" ? `|${[...placements].sort().join(",")}|${catalogTemplates.join(",")}|${photoUrl}` : ""}`;
  const columns = useMemo(
    () =>
      blind
        ? [...variants].sort(
            (a, b) => hash(selection + a.id) - hash(selection + b.id),
          )
        : variants,
    [blind, variants, selection],
  );
  const visibleColumns =
    surface === "home-suite" && !blind
      ? [columns.find((v) => v.id === activeSet) ?? columns[0]!]
      : columns;
  const selectedRecord = history.find(
    (record) =>
      record.id === activeRun &&
      record.brandId === brandId &&
      record.homeId === selected[0],
  );
  const deleteRun = (record: RunRecord) => {
    const reviewKeys = [
      record.id,
      "status-quo",
      ...(record.result.expandedIdeas ?? []).map((i) => i.id),
    ].map(
      (id) => `${STORE}:review:${id === record.id ? id : `${record.id}:${id}`}`,
    );
    const reviews: [string, string][] = [];
    try {
      for (const key of reviewKeys) {
        const value = localStorage.getItem(key);
        if (value !== null) reviews.push([key, value]);
        localStorage.removeItem(key);
      }
    } catch {
      /* Removing the run still works when storage is unavailable. */
    }
    setHistory((current) => current.filter((run) => run.id !== record.id));
    setActiveRun((current) => (current === record.id ? null : current));
    toast("Run deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          try {
            for (const [key, value] of reviews)
              localStorage.setItem(key, value);
          } catch {
            /* The generated snapshot can still be restored. */
          }
          setHistory((current) =>
            current.some((run) => run.id === record.id)
              ? current
              : [...current, record].sort((a, b) => a.at.localeCompare(b.at)),
          );
        },
      },
    });
  };
  const cellFor = (variant: Variant): Cell | undefined => {
    const current = cells[`${selection}|${variant.id}`];
    if (current?.status === "running") return current;
    if (selectedRecord && selectedRecord.variant.id === variant.id)
      return {
        status: "done",
        result: selectedRecord.result,
        at: selectedRecord.at,
        ran: settingsOf(selectedRecord.variant),
      };
    return current;
  };
  const inspectorCell =
    activeRun === "source" ? undefined : cellFor(visibleColumns[0]!);
  const production = Object.entries(cells)
    .flatMap(([key, cell]) =>
      key.startsWith(`${surface}|${brandId}|`) &&
      cell.status === "done" &&
      cell.result.baseSystem
        ? [cell.result.baseSystem]
        : [],
    )
    .at(-1);

  const homeProduction = Object.values(cells)
    .flatMap((cell) =>
      cell.status === "done" && cell.result.homeBaseSystem
        ? [cell.result.homeBaseSystem]
        : [],
    )
    .at(-1);

  const chooseBrand = (id: string) => {
    setBrandId(id);
    setActiveRun(null);
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
  const duplicate = (variant: Variant) => {
    if (variants.length >= 20) return;
    const id = nanoid();
    setActiveSet(id);
    setVariants((list) => [
      ...list,
      {
        ...variant,
        id,
        label: `${variant.label} · set ${variants.length + 1}`.slice(0, 40),
      },
    ]);
  };

  async function run(variant: Variant, action: CopyLabAction = "both") {
    const key = `${selection}|${variant.id}`;
    if (cells[key]?.status === "running") return;
    const prior: Cell | undefined = selectedRecord
      ? {
          status: "done",
          result: selectedRecord.result,
          at: selectedRecord.at,
          ran: settingsOf(selectedRecord.variant),
        }
      : undefined;
    const previousOutput =
      prior?.status === "done"
        ? (prior.result.output as CopyLabHomeSuite)
        : selectedHome
          ? fixtureHomeSuite(selectedHome, photoUrl)
          : null;
    setActiveRun(null);
    setCells((c) => ({ ...c, [key]: { status: "running" } }));
    const { id: _id, ...body } = variant;
    try {
      const res = await fetch("/api/lab/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          action: surface === "home-suite" ? action : undefined,
          brandId,
          homeIds: selected,
          variant: body,
          placements,
          catalogTemplates,
          photoUrl,
          catalogHomeIds:
            surface === "home-suite" ? selected.slice(0, 1) : undefined,
        }),
      });
      const json = (await res.json()) as CopyLabRunResult & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? res.statusText);
      if (surface === "home-suite" && previousOutput && json.output)
        json.output = mergeCopyLabSuite(
          previousOutput,
          json.output as CopyLabHomeSuite,
          action,
        );
      if (action === "ad" && prior?.status === "done")
        json.photoPlan = prior.result.photoPlan;
      const record: RunRecord = {
        id: nanoid(),
        selection,
        brandId,
        homeId: selected[0] ?? "",
        photoUrl,
        action,
        variant: { ...variant },
        at: new Date().toISOString(),
        result: json,
      };
      setHistory((records) => [...records, record].slice(-30));
      setActiveRun(null);
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
      [
        JSON.stringify(
          {
            variants,
            history,
            cells: Object.fromEntries(
              Object.entries(cells).filter(
                ([, cell]) => cell.status === "done",
              ),
            ),
            picks,
            context: {
              activeSet,
              surface,
              brandId,
              homeIds,
              catalogTemplates,
              photo,
              placements,
              placement,
            },
            snapshotAt: props.snapshotAt,
            inspiration,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `copy-lab-${new Date().toISOString().slice(0, 16)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importRuns = async (file: File) => {
    try {
      if (file.size > 10_000_000)
        throw new Error("Experiment file is too large.");
      const experiment = copyLabExperimentSchema.parse(
        JSON.parse(await file.text()),
      );
      const context = experiment.context;
      if (
        !props.brands.some((b) => b.id === context.brandId) ||
        context.homeIds.some(
          (id) =>
            !props.homes.some(
              (h) => h.id === id && h.brandId === context.brandId,
            ),
        )
      )
        throw new Error("This experiment needs a different fixture snapshot.");
      const done = Object.entries(experiment.cells).slice(-KEEP_CELLS);
      setInspiration(experiment.inspiration ?? []);
      setHistory(experiment.history ?? []);
      setActiveRun(null);
      setVariants(experiment.variants);
      setActiveSet(context.activeSet ?? experiment.variants[0]!.id);
      setCells(Object.fromEntries(done));
      setPicks(experiment.picks);
      setSurface(context.surface);
      setBrandId(context.brandId);
      setHomeIds(context.homeIds);
      setCatalogTemplates(context.catalogTemplates);
      setPhoto(context.photo);
      setPlacements(context.placements);
      setPlacement(context.placement);
      setImportMessage(
        "Experiment loaded. Review it without rerunning the model.",
      );
    } catch {
      setImportMessage(
        "Could not load this experiment. Use a Copy Lab export with the same fixtures.",
      );
    }
  };

  const canRun = spec.homes === "none" || selected.length > 0;
  const generating = visibleColumns.some(
    (v) => cells[`${selection}|${v.id}`]?.status === "running",
  );

  return (
    <div className="@container w-full space-y-6 p-3 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Copy lab</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare Instagram feed posts, stories and every carousel card, with
            the prompt build alongside.
          </p>
          <p className="text-xs text-muted-foreground">
            Fixtures from {props.snapshotAt.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {surface !== "home-suite" && (
            <Button
              size="sm"
              disabled={!canRun || generating}
              onClick={() => visibleColumns.forEach((v) => void run(v))}
            >
              {generating ? "Generating…" : "Generate set"}
            </Button>
          )}
        </div>
      </header>

      {importMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {importMessage}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          size="sm"
          aria-label="Brand"
          value={brandId}
          onValueChange={chooseBrand}
          options={props.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
        {spec.homes === "one" && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <HomePicker
              key={brandId}
              homes={brandHomes.map((home) => ({
                id: home.id,
                name: home.name,
                imageUrl: home.heroUrl ?? home.photos[0]?.url ?? "",
                thumbUrl:
                  home.photos.find((photo) => photo.url === home.heroUrl)
                    ?.thumbUrl ??
                  home.photos[0]?.thumbUrl ??
                  null,
                bedrooms: home.bedrooms,
                guests: home.guests,
                nightlyFrom: home.nightlyFrom,
              }))}
              picked={selected}
              max={1}
              single
              label="From homes"
              title={`Choose one home · ${brand.name}`}
              onChange={(ids) => {
                if (ids.length) {
                  setHomeIds(ids.slice(0, 1));
                  setActiveRun(null);
                }
              }}
            />
            {selectedHome && (
              <div className="flex min-w-0 items-center gap-2">
                {(selectedHome.heroUrl ?? selectedHome.photos[0]?.url) && (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={selectedHome.heroUrl ?? selectedHome.photos[0]?.url}
                    alt=""
                    className="h-10 w-14 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p
                    className="max-w-80 truncate text-sm font-medium"
                    title={selectedHome.name}
                  >
                    {selectedHome.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedHome.bedrooms} bedrooms · sleeps{" "}
                    {selectedHome.guests}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        {surface !== "home-suite" && !blind && (
          <SimpleSelect
            size="sm"
            aria-label="Copy set"
            value={visibleColumns[0]!.id}
            onValueChange={setActiveSet}
            options={columns.map((v) => ({ value: v.id, label: v.label }))}
          />
        )}
      </div>
      {surface === "home-suite" && selectedHome ? (
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 @4xl:grid-cols-[320px_minmax(0,1fr)] @6xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3 @4xl:sticky @4xl:top-4 @4xl:max-h-[calc(100dvh-2rem)] @4xl:overflow-y-auto">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="font-medium">
                {selectedRecord
                  ? `Starting from: ${selectedRecord.variant.label}`
                  : "Fresh experiment"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {selectedRecord
                  ? "Partial writes preserve the other copy from this saved run. Results create a separate run."
                  : "Each write creates a separate run from fixture photos. Select a saved run as a starting point to reuse its copy."}
              </p>
              {selectedRecord && (
                <Button
                  className="mt-2"
                  size="xs"
                  variant="outline"
                  onClick={() => setActiveRun(null)}
                >
                  Start fresh
                </Button>
              )}
            </div>
            <PromptInspector
              brand={brand}
              home={selectedHome}
              homes={brandHomes}
              variant={visibleColumns[0]!}
              basePrompts={
                props.promptBases[brandId]![
                  visibleColumns[0]!.story ? "withStory" : "withoutStory"
                ]
              }
              stale={false}
              busy={generating}
              canRun={canRun}
              onRun={(action) => void run(visibleColumns[0]!, action)}
              onChange={(patch) => update(visibleColumns[0]!.id, patch)}
              photos={selectedHome.photos}
              photoUrl={photoUrl}
              onPhoto={(url) => {
                setPhoto(url);
                setActiveRun(null);
              }}
            />
          </div>
          <section className="min-w-0 space-y-5" aria-label="Run comparison">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Saved runs</h2>
                <p className="text-xs text-muted-foreground">
                  Independent results, newest first. Adjust each preview without
                  changing its prompt snapshot.
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setShowSource((v) => !v)}
              >
                {showSource ? "Hide source photos" : "Show source photos"}
              </Button>
            </div>
            {generating && (
              <p
                role="status"
                className="rounded-lg border bg-muted p-4 text-sm"
              >
                Writing a new run… Your saved runs stay available below.
              </p>
            )}
            {cells[`${selection}|${visibleColumns[0]!.id}`]?.status ===
              "error" && (
              <p role="alert" className="text-sm text-destructive">
                {
                  (
                    cells[`${selection}|${visibleColumns[0]!.id}`] as Extract<
                      Cell,
                      { status: "error" }
                    >
                  ).error
                }
              </p>
            )}
            {history
              .filter(
                (r) =>
                  r.selection.startsWith("home-suite|") &&
                  r.brandId === brandId &&
                  r.homeId === selectedHome.id,
              )
              .slice()
              .reverse()
              .map((record, index, records) => (
                <RunIdeas
                  homes={brandHomes}
                  key={record.id}
                  id={record.id}
                  title={`Run ${records.length - index} · ${record.variant.label} · ${{ ad: "Ad copy", photo: "Photo copy", both: "Ad + photo copy" }[record.action]}`}
                  at={record.at}
                  output={record.result.output as CopyLabHomeSuite}
                  result={record.result}
                  variant={record.variant}
                  home={selectedHome}
                  brand={brand}
                  selected={selectedRecord?.id === record.id}
                  onDelete={() => deleteRun(record)}
                  onUse={() => {
                    setActiveRun(record.id);
                    setPhoto(record.photoUrl ?? null);
                  }}
                />
              ))}
            {(showSource ||
              !history.some(
                (r) =>
                  r.selection.startsWith("home-suite|") &&
                  r.brandId === brandId &&
                  r.homeId === selectedHome.id,
              )) && (
              <RunReview
                key={`source-${selectedHome.id}-${photoUrl}`}
                id={`source-${selectedHome.id}-${photoUrl}`}
                title="Source photos"
                output={fixtureHomeSuite(selectedHome, photoUrl)}
                home={selectedHome}
                brand={brand}
              />
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 items-start gap-6 @5xl:grid-cols-[minmax(0,1fr)_400px]">
            <div
              className={
                surface === "home-suite"
                  ? "min-w-0 space-y-6"
                  : "flex gap-4 overflow-x-auto pb-4"
              }
            >
              {surface === "catalog-card" && selected[0] && (
                <HumanColumn
                  home={props.homes.find((h) => h.id === selected[0])!}
                />
              )}
              {visibleColumns.map((variant, index) => {
                const cell =
                  activeRun === "source" ? undefined : cellFor(variant);
                const pick = picks[selection];
                const reveal = !blind || Boolean(pick);
                return (
                  <div
                    key={variant.id}
                    className={`${surface === "home-suite" ? "w-full" : "w-[380px] shrink-0"} space-y-3 rounded-lg border p-3 ${pick === variant.id ? "border-primary ring-1 ring-primary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {reveal ? variant.label : `Option ${index + 1}`}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="xs"
                          variant={pick === variant.id ? "default" : "outline"}
                          aria-pressed={pick === variant.id}
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
                        homeProduction={
                          surface === "home-suite"
                            ? (homeProduction ?? null)
                            : undefined
                        }
                        onChange={(patch) => update(variant.id, patch)}
                        onDuplicate={() => duplicate(variant)}
                        onRemove={
                          variants.length > 1
                            ? () => {
                                setVariants((list) =>
                                  list.filter((v) => v.id !== variant.id),
                                );
                                setPicks((p) =>
                                  Object.fromEntries(
                                    Object.entries(p).filter(
                                      ([, id]) => id !== variant.id,
                                    ),
                                  ),
                                );
                              }
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
                        cell?.status === "done" &&
                        cell.ran !== settingsOf(variant)
                      }
                      reveal={reveal}
                      brand={brand}
                      placement={placement}
                      photoUrl={photoUrl}
                      catalogHomes={selectedHome ? [selectedHome] : []}
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
                  + Copy set
                </button>
              )}
            </div>
            {!blind && (
              <PromptInspector
                brand={brand}
                home={selectedHome}
                homes={brandHomes}
                variant={visibleColumns[0]!}
                basePrompts={
                  props.promptBases[brandId]![
                    visibleColumns[0]!.story ? "withStory" : "withoutStory"
                  ]
                }
                result={
                  inspectorCell?.status === "done"
                    ? inspectorCell.result
                    : undefined
                }
                stale={
                  inspectorCell?.status === "done" &&
                  inspectorCell.ran !== settingsOf(visibleColumns[0]!)
                }
                busy={generating}
                canRun={canRun}
                onRun={(action) => void run(visibleColumns[0]!, action)}
                onChange={(patch) => update(visibleColumns[0]!.id, patch)}
                photos={selectedHome?.photos ?? []}
                photoUrl={photoUrl}
                onPhoto={(url) => {
                  setPhoto(url);
                  setActiveRun(null);
                }}
              />
            )}
          </div>
        </>
      )}
      {surface === "home-suite" && selectedHome && (
        <details className="space-y-3 rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            Prompt ingredients, compositions and photos
          </summary>
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
            <details>
              <summary className="cursor-pointer font-medium">
                Brand story
              </summary>
              <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {brand.story ?? "No brand story in this fixture."}
              </p>
            </details>
            <div>
              <h3 className="font-medium">Market and facts</h3>
              <p className="mt-2">
                {selectedHome.market?.label ??
                  selectedHome.place ??
                  brand.place}
              </p>
              <p>
                {selectedHome.bedrooms} bedrooms · {selectedHome.bathrooms}{" "}
                bathrooms · sleeps {selectedHome.guests}
              </p>
              <p className="mt-1 max-h-24 overflow-auto text-muted-foreground">
                {selectedHome.amenities.join(" · ")}
              </p>
            </div>
            <div>
              <h3 className="font-medium">Prompt path</h3>
              <p className="mt-2 text-muted-foreground">
                Brand story + market + home facts + numbered photos + template
                guidance + variant settings → catalog copy / home ad copy and
                layouts → production composition renderer → placement preview.
              </p>
              <p className="mt-2">
                Static and carousel currently share the production caption and
                first card.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATALOG_TEMPLATES.map((id) => (
              <label key={id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={catalogTemplates.includes(id)}
                  onChange={() =>
                    setCatalogTemplates((ids) =>
                      ids.includes(id)
                        ? ids.length > 1
                          ? ids.filter((t) => t !== id)
                          : ids
                        : ids.length < 4
                          ? [...ids, id]
                          : ids,
                    )
                  }
                />
                {COMPOSITION_TEMPLATES.find((t) => t.id === id)?.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Choose up to four catalog compositions. Each gets its own copy call
            using its own guidance; static and carousel add one shared
            composition call.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {catalogTemplates.map((id) => (
              <CompositionGuide key={id} templateId={id} />
            ))}
          </div>
          <h3 className="text-xs font-medium">
            Shared photo for composition comparisons
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedHome.photos.map((p, index) => (
              <button
                type="button"
                key={p.url}
                aria-label={`Compare on photo ${index + 1}`}
                aria-pressed={photoUrl === p.url}
                onClick={() => setPhoto(p.url)}
                className={`w-20 shrink-0 rounded border p-1 ${photoUrl === p.url ? "ring-2 ring-foreground" : ""}`}
              >
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={p.thumbUrl ?? p.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <span className="text-xs">{index + 1}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {surface === "home-suite" && (
        <details className="space-y-3 rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            Supported placements
          </summary>
          <p className="text-sm text-muted-foreground">
            Select the placements to compose for, then inspect each. This
            changes the experiment, not campaign delivery. Facebook feed uses
            1:1, Instagram feed 4:5, Stories and Reels 9:16.
          </p>
          <div className="flex flex-wrap gap-2">
            {META_PLACEMENTS.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={placements.includes(p.id)}
                  onChange={() => {
                    const next = placements.includes(p.id)
                      ? placements.filter((id) => id !== p.id)
                      : [...placements, p.id];
                    if (!next.length) return;
                    setPlacements(next);
                    if (!next.includes(placement)) setPlacement(next[0]!);
                  }}
                />
                {p.label}
              </label>
            ))}
          </div>
          {surface === "home-suite" && (
            <SimpleSelect
              size="sm"
              aria-label="Additional placement"
              value={placement}
              onValueChange={(v) => setPlacement(v as MetaPlacement)}
              options={META_PLACEMENTS.filter((p) =>
                placements.includes(p.id),
              ).map((p) => ({ value: p.id, label: p.label }))}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Local placement approximations. Stories and Reels show the existing
            safe-zone guides. Landing links use the fixture&apos;s brand
            website.
          </p>
        </details>
      )}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Inspiration board ({inspiration.length})
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Keep references and what you like about them here. Saved in this
            browser and included in experiment exports. References guide style;
            listing facts still support claims.
          </p>
          {inspiration.map((item, i) => (
            <div
              key={i}
              className="grid gap-2 rounded border p-3 sm:grid-cols-2"
            >
              <input
                aria-label={`Reference ${i + 1} title`}
                placeholder="Reference title"
                className="rounded border bg-background p-2 text-sm"
                value={item.title}
                maxLength={200}
                onChange={(e) =>
                  setInspiration((list) =>
                    list.map((v, n) =>
                      n === i ? { ...v, title: e.target.value } : v,
                    ),
                  )
                }
              />
              <input
                aria-label={`Reference ${i + 1} URL`}
                placeholder="Image or source URL"
                className="rounded border bg-background p-2 text-sm"
                value={item.url}
                maxLength={2000}
                onChange={(e) =>
                  setInspiration((list) =>
                    list.map((v, n) =>
                      n === i ? { ...v, url: e.target.value } : v,
                    ),
                  )
                }
              />
              <Textarea
                aria-label={`Reference ${i + 1} notes`}
                placeholder="What should we learn from this? Hook, layout, voice…"
                value={item.notes}
                maxLength={5000}
                onChange={(e) =>
                  setInspiration((list) =>
                    list.map((v, n) =>
                      n === i ? { ...v, notes: e.target.value } : v,
                    ),
                  )
                }
              />
              <div className="flex items-start gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!item.notes.trim()}
                  onClick={() =>
                    setVariants((list) =>
                      list.map((v, n) =>
                        n === 0
                          ? {
                              ...v,
                              appendix: [
                                v.appendix,
                                `Style inspiration (${item.title || "reference"}): ${item.notes}`,
                              ]
                                .filter(Boolean)
                                .join("\n\n"),
                            }
                          : v,
                      ),
                    )
                  }
                >
                  Use notes in first variant
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setInspiration((list) => list.filter((_, n) => n !== i))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={inspiration.length >= 30}
            onClick={() =>
              setInspiration((list) => [
                ...list,
                { title: "", url: "", notes: "" },
              ])
            }
          >
            Add reference
          </Button>
        </div>
      </details>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Advanced experiments and sharing
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={blind} onCheckedChange={setBlind} />
              Blind comparison
            </label>
            <Button variant="outline" size="sm" onClick={exportRuns}>
              Export experiment
            </Button>
            <label className="cursor-pointer rounded-md border px-3 py-1 text-xs">
              Import experiment
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importRuns(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {COPY_LAB_SURFACES.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={s.id === surface ? "default" : "outline"}
                  aria-pressed={s.id === surface}
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
                  aria-pressed={b.id === brandId}
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
                      aria-pressed={on}
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
          </section>
        </div>
      </details>
    </div>
  );
}

function VariantEditor(props: {
  variant: Variant;
  presets: Preset[];
  production: string | null;
  homeProduction?: string | null;
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
    variant.system === null ? null : "custom catalog prompt",
    variant.homeSystem ? "custom composition prompt" : null,
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
        <p className="text-xs text-muted-foreground">
          Production defaults already include the relevant campaign house rules
          and catalog voice. Replacing a system prompt can change those
          defaults.
        </p>
        <div className="flex flex-wrap gap-3">
          {props.presets
            .filter((preset) => preset.id === "voice")
            .map((preset) => (
              <label key={preset.id} className="flex items-center gap-2">
                <Switch
                  checked={variant.appendix.includes(preset.text)}
                  onCheckedChange={(on) =>
                    onChange({
                      appendix: on
                        ? [variant.appendix.trim(), preset.text]
                            .filter(Boolean)
                            .join("\n\n")
                        : variant.appendix.replaceAll(preset.text, "").trim(),
                    })
                  }
                />
                {preset.label} · optional experiment
              </label>
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
                aria-label="Custom system prompt"
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
        {props.homeProduction !== undefined && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Home composition prompt
            </summary>
            {variant.homeSystem == null ? (
              <Button
                size="xs"
                variant="outline"
                disabled={!props.homeProduction}
                onClick={() => onChange({ homeSystem: props.homeProduction })}
              >
                Edit a copy
              </Button>
            ) : (
              <div className="space-y-1">
                <Textarea
                  aria-label="Home composition system prompt"
                  value={variant.homeSystem}
                  onChange={(e) => onChange({ homeSystem: e.target.value })}
                  className="max-h-96 min-h-64 font-mono text-[11px]"
                />
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onChange({ homeSystem: null })}
                >
                  Back to production
                </Button>
              </div>
            )}
          </details>
        )}
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={props.onDuplicate}>
            New variant from these settings
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
        <CatalogArtwork
          home={home}
          headline={home.catalog.title ?? home.name}
          pills={home.catalog.pills ?? []}
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
  brand: CopyLabBrand;
  placement: MetaPlacement;
  photoUrl?: string;
  catalogHomes: CopyLabHome[];
}) {
  const { cell } = props;
  if (!cell)
    return props.surface === "home-suite" ? (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Source photos · choose a prompt direction and write copy to create a
          local run.
        </p>
        <HomeSuite
          key={`source-${props.homes[0]!.id}-${props.photoUrl}`}
          output={fixtureHomeSuite(props.homes[0]!, props.photoUrl)}
          home={props.homes[0]!}
          brand={props.brand}
          placement={props.placement}
          photoUrl={props.photoUrl}
          catalogHomes={props.homes.slice(0, 1)}
        />
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Not run</p>
    );
  if (cell.status === "running")
    return props.surface === "home-suite" ? (
      <div className="space-y-3">
        <p role="status" className="text-sm text-muted-foreground">
          Writing a new local run…
        </p>
        <HomeSuite
          output={fixtureHomeSuite(props.homes[0]!, props.photoUrl)}
          home={props.homes[0]!}
          brand={props.brand}
          placement={props.placement}
          photoUrl={props.photoUrl}
          catalogHomes={props.homes.slice(0, 1)}
        />
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Writing…</p>
    );
  if (cell.status === "error")
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {cell.error}
        </p>
        {props.surface === "home-suite" && (
          <HomeSuite
            output={fixtureHomeSuite(props.homes[0]!, props.photoUrl)}
            home={props.homes[0]!}
            brand={props.brand}
            placement={props.placement}
            photoUrl={props.photoUrl}
            catalogHomes={props.homes.slice(0, 1)}
          />
        )}
      </div>
    );
  const { result } = cell;
  return (
    <div className="space-y-3">
      {props.stale && (
        <p className="text-xs text-muted-foreground">
          Settings changed since this result. Generate to apply them.
        </p>
      )}
      {props.reveal && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Run details
          </summary>
          <p className="text-xs text-muted-foreground">
            {result.model} · {(result.ms / 1000).toFixed(1)}s ·{" "}
            {result.usage.inputTokens.toLocaleString()} in /{" "}
            {result.usage.outputTokens.toLocaleString()} out
            {props.stale && " · edited since this run"}
          </p>
        </details>
      )}
      {result.problems.length > 0 && (
        <details className="text-xs text-amber-700 dark:text-amber-400">
          <summary className="cursor-pointer">
            Generation notes ({result.problems.length})
          </summary>
          {result.problems.join(" / ")}
        </details>
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
      ) : props.surface === "home-suite" ? (
        <HomeSuite
          key={`${props.homes[0]?.id}-${cell.at}`}
          output={result.output as CopyLabHomeSuite}
          home={props.homes[0]!}
          brand={props.brand}
          placement={props.placement}
          photoUrl={props.photoUrl}
          catalogHomes={props.catalogHomes}
        />
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
      {photo &&
        (home ? (
          <CatalogArtwork
            home={home}
            headline={output.headline}
            pills={output.pills}
            photo={photo}
          />
        ) : null)}
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
