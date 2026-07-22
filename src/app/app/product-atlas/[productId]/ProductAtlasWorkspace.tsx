"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Code2,
  Eye,
  Map as MapIcon,
  Plus,
  Save,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  emptyStorefrontContent,
  productAtlasSchema,
  storefrontSurfaceIds,
  storefrontSurfaceRegistry,
  type ProductAtlas,
  type StorefrontSurfaceId,
} from "@/lib/product-atlas";
import { cn } from "@/lib/utils";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type ProductDetail = RouterOutputs["productStorefront"]["getProduct"];
type Editors = RouterOutputs["productStorefront"]["listEditors"];
type Tab = "overview" | "journey" | "views" | "observations" | "edit" | "json";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "journey", label: "Journey map" },
  { id: "views", label: "Views" },
  { id: "observations", label: "Observations" },
  { id: "edit", label: "Edit graph" },
  { id: "json", label: "Advanced JSON" },
];

const nodeId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

export function ProductAtlasWorkspace({
  product,
  editors,
}: {
  product: ProductDetail;
  editors: Editors;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [atlas, setAtlas] = useState<ProductAtlas>(product.atlas);
  const [rawJson, setRawJson] = useState(
    JSON.stringify(product.atlas, null, 2),
  );
  const [surface, setSurface] =
    useState<StorefrontSurfaceId>("apple_app_store");

  const saveProduct = useMutation(
    trpc.productStorefront.updateProduct.mutationOptions({
      onSuccess: () => {
        toast.success("Product Atlas saved");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const createStorefront = useMutation(
    trpc.productStorefront.createStorefront.mutationOptions({
      onSuccess: (created) => {
        toast.success("Storefront created");
        router.push(`/app/apps/${created.id}`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const existingSurfaces = new Set(
    product.storefronts.map((item) => item.surface),
  );
  const availableSurfaces = storefrontSurfaceIds.filter(
    (item) => !existingSurfaces.has(item),
  );
  const selectedSurface = availableSurfaces.includes(surface)
    ? surface
    : availableSurfaces[0];

  const saveAtlas = (next: ProductAtlas) => {
    const parsed = productAtlasSchema.safeParse(next);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid atlas");
      return;
    }
    saveProduct.mutate({
      productId: product.id,
      atlas: parsed.data,
    });
  };

  return (
    <main className="space-y-6">
      <Link
        href="/app/product-atlas"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" /> Product Atlas
      </Link>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs">{product.brand.name}</p>
          <h1 className="mt-1 text-3xl font-semibold">{product.name}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            {product.description || "No product summary yet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={product.managerUserId ?? ""}
            onChange={(event) =>
              saveProduct.mutate({
                productId: product.id,
                managerUserId: event.target.value || null,
              })
            }
            className="bg-background rounded-lg border px-3 py-2 text-xs"
          >
            <option value="">No product manager</option>
            {editors.map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.name ?? editor.email}
              </option>
            ))}
          </select>
          <span className="bg-muted rounded-full px-3 py-1.5 text-xs capitalize">
            {product.lifecycleStatus}
          </span>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-medium whitespace-nowrap",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview atlas={atlas} product={product} />}
      {tab === "journey" && <JourneyMap atlas={atlas} />}
      {tab === "views" && <Views atlas={atlas} />}
      {tab === "observations" && <Observations atlas={atlas} />}
      {tab === "edit" && (
        <GraphEditor
          atlas={atlas}
          onChange={(next) => {
            setAtlas(next);
            setRawJson(JSON.stringify(next, null, 2));
          }}
          onSave={() => saveAtlas(atlas)}
          saving={saveProduct.isPending}
        />
      )}
      {tab === "json" && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">Complete atlas document</h2>
            <p className="text-muted-foreground text-xs">
              JSON is validated before it reaches the shared service.
            </p>
          </div>
          <textarea
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            spellCheck={false}
            className="bg-muted/30 min-h-[520px] w-full rounded-xl border p-4 font-mono text-xs"
          />
          <button
            onClick={() => {
              try {
                const parsed = productAtlasSchema.parse(JSON.parse(rawJson));
                setAtlas(parsed);
                setRawJson(JSON.stringify(parsed, null, 2));
                saveAtlas(parsed);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Invalid JSON",
                );
              }
            }}
            disabled={saveProduct.isPending}
            className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Save className="size-4" /> Validate and save
          </button>
        </section>
      )}

      <section className="space-y-3 border-t pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-semibold">Storefronts</h2>
            <p className="text-muted-foreground text-xs">
              Distribution representations owned by this product.
            </p>
          </div>
          <Link
            href="/app/apps"
            className="text-primary text-xs hover:underline"
          >
            Open operations queue
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {product.storefronts.map((storefront) => (
            <Link
              key={storefront.id}
              href={`/app/apps/${storefront.id}`}
              className="bg-card hover:border-foreground/25 flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">
                  {storefrontSurfaceRegistry[storefront.surface].label}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {storefront.listingStatus} ·{" "}
                  {storefront.freshnessStatus.replaceAll("_", " ")}
                </p>
              </div>
              <ArrowRight className="text-muted-foreground size-4" />
            </Link>
          ))}
          {availableSurfaces.length > 0 && selectedSurface && (
            <div className="bg-muted/20 flex items-center gap-2 rounded-xl border border-dashed p-3">
              <select
                value={selectedSurface}
                onChange={(event) =>
                  setSurface(event.target.value as StorefrontSurfaceId)
                }
                className="bg-background min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs"
              >
                {availableSurfaces.map((item) => (
                  <option key={item} value={item}>
                    {storefrontSurfaceRegistry[item].label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  createStorefront.mutate({
                    productId: product.id,
                    surface: selectedSurface,
                    content: emptyStorefrontContent,
                  })
                }
                className="bg-foreground text-background rounded-lg px-3 py-2 text-xs font-medium"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Overview({
  atlas,
  product,
}: {
  atlas: ProductAtlas;
  product: ProductDetail;
}) {
  const facts = [
    ["Jobs", atlas.jobs.length, MapIcon],
    ["Journeys", atlas.journeys.length, ArrowRight],
    ["Stories", atlas.stories.length, Code2],
    ["Views", atlas.views.length, Eye],
    ["Storefronts", product.storefronts.length, Store],
  ] as const;
  return (
    <section className="grid gap-3 sm:grid-cols-5">
      {facts.map(([label, value, Icon]) => (
        <div key={label} className="bg-card rounded-xl border p-4">
          <Icon className="text-muted-foreground size-4" />
          <p className="mt-4 text-2xl font-semibold">{value}</p>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
      ))}
    </section>
  );
}

function JourneyMap({ atlas }: { atlas: ProductAtlas }) {
  const viewById = new Map(atlas.views.map((view) => [view.id, view]));
  return (
    <section className="space-y-4">
      {atlas.journeys.length === 0 ? (
        <Empty label="No journeys mapped yet." />
      ) : (
        atlas.journeys.map((journey) => (
          <div key={journey.id} className="bg-card rounded-2xl border p-5">
            <h2 className="font-semibold">{journey.name}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[...journey.steps]
                .sort((a, b) => a.order - b.order)
                .map((step) => {
                  const stories = atlas.stories.filter((story) =>
                    step.storyIds.includes(story.id),
                  );
                  const linkedViewIds = new Set(
                    atlas.storyViewLinks
                      .filter((link) =>
                        stories.some((story) => story.id === link.storyId),
                      )
                      .map((link) => link.viewId),
                  );
                  return (
                    <div key={step.id} className="bg-muted/30 rounded-xl p-4">
                      <p className="text-muted-foreground text-[10px] uppercase">
                        Step {step.order + 1}
                      </p>
                      <h3 className="mt-1 font-medium">{step.name}</h3>
                      <div className="mt-3 space-y-1 text-xs">
                        {stories.map((story) => (
                          <p key={story.id}>{story.name}</p>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {[...linkedViewIds].map((id) => (
                          <span
                            key={id}
                            className="bg-background rounded-full border px-2 py-1 text-[10px]"
                          >
                            {viewById.get(id)?.name ?? id}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Views({ atlas }: { atlas: ProductAtlas }) {
  const surfaceById = new Map(
    atlas.surfaces.map((surface) => [surface.id, surface]),
  );
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {atlas.views.length === 0 ? (
        <Empty label="No product views mapped yet." />
      ) : (
        atlas.views.map((view) => (
          <div key={view.id} className="bg-card rounded-xl border p-4">
            <Eye className="text-muted-foreground size-4" />
            <h2 className="mt-3 font-medium">{view.name}</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {surfaceById.get(view.surfaceId)?.name ?? view.surfaceId}
            </p>
            {view.reference && (
              <code className="bg-muted mt-3 block rounded-lg p-2 text-[10px]">
                {view.reference.value}
              </code>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function Observations({ atlas }: { atlas: ProductAtlas }) {
  return (
    <section className="space-y-2">
      {atlas.observations.length === 0 ? (
        <Empty label="No observations recorded yet." />
      ) : (
        atlas.observations.map((observation) => (
          <div
            key={observation.id}
            className="bg-card flex items-start gap-3 rounded-xl border p-4"
          >
            {observation.state === "inferred" ? (
              <CircleDashed className="mt-0.5 size-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
            )}
            <div>
              <p className="text-xs font-medium">
                {observation.state.replaceAll("_", " ")}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {observation.targetType} · {observation.targetId}
              </p>
              {observation.note && (
                <p className="mt-2 text-sm">{observation.note}</p>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function GraphEditor({
  atlas,
  onChange,
  onSave,
  saving,
}: {
  atlas: ProductAtlas;
  onChange: (atlas: ProductAtlas) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const updateNames = (
    key: "jobs" | "stories" | "surfaces" | "views",
    id: string,
    name: string,
  ) =>
    onChange({
      ...atlas,
      [key]: atlas[key].map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    });
  const remove = (key: "jobs" | "stories" | "surfaces" | "views", id: string) =>
    onChange({
      ...atlas,
      [key]: atlas[key].filter((item) => item.id !== id),
    });
  return (
    <section className="space-y-6">
      <EditorCollection
        title="Jobs"
        items={atlas.jobs}
        onName={(id, name) => updateNames("jobs", id, name)}
        onRemove={(id) => remove("jobs", id)}
        onAdd={() =>
          onChange({
            ...atlas,
            jobs: [...atlas.jobs, { id: nodeId("job"), name: "New job" }],
          })
        }
      />
      <EditorCollection
        title="Stories"
        items={atlas.stories}
        onName={(id, name) => updateNames("stories", id, name)}
        onRemove={(id) => remove("stories", id)}
        onAdd={() =>
          onChange({
            ...atlas,
            stories: [
              ...atlas.stories,
              { id: nodeId("story"), name: "New story" },
            ],
          })
        }
      />
      <EditorCollection
        title="Surfaces"
        items={atlas.surfaces}
        onName={(id, name) => updateNames("surfaces", id, name)}
        onRemove={(id) => remove("surfaces", id)}
        onAdd={() =>
          onChange({
            ...atlas,
            surfaces: [
              ...atlas.surfaces,
              { id: nodeId("surface"), name: "New surface", kind: "other" },
            ],
          })
        }
      />
      <EditorCollection
        title="Views"
        items={atlas.views}
        onName={(id, name) => updateNames("views", id, name)}
        onRemove={(id) => remove("views", id)}
        onAdd={() => {
          const surfaceId = atlas.surfaces[0]?.id;
          if (!surfaceId) return toast.error("Add a surface first");
          onChange({
            ...atlas,
            views: [
              ...atlas.views,
              { id: nodeId("view"), name: "New view", surfaceId },
            ],
          });
        }}
      />
      <p className="text-muted-foreground text-xs">
        Journey steps, story/view links, implementation references, and
        observations are available in Advanced JSON in this first editor pass.
      </p>
      <button
        onClick={onSave}
        disabled={saving}
        className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
      >
        <Save className="size-4" /> Save graph
      </button>
    </section>
  );
}

function EditorCollection({
  title,
  items,
  onName,
  onRemove,
  onAdd,
}: {
  title: string;
  items: { id: string; name: string }[];
  onName: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          onClick={onAdd}
          className="text-primary inline-flex items-center gap-1 text-xs"
        >
          <Plus className="size-3" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <input
              value={item.name}
              onChange={(event) => onName(item.id, event.target.value)}
              className="bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <code className="text-muted-foreground hidden text-[10px] sm:block">
              {item.id}
            </code>
            <button
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.name}`}
              className="text-muted-foreground hover:text-destructive rounded-lg border p-2"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground col-span-full rounded-xl border border-dashed p-8 text-center text-sm">
      {label}
    </div>
  );
}
