"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Images,
  Layers,
  Radio,
  Users,
  RotateCcw,
  Plus,
  House,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { ApprovedStamp } from "@/components/approved-stamp";
import { Badge } from "@/components/ui/badge";
import { SimpleDialog } from "@/components/ui/dialog";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import { AdIdeaPreview } from "@/app/app/brands/[brandSlug]/ads/_views/AdIdeaPreview";
import { AdIdeaSlideRow } from "@/app/app/brands/[brandSlug]/ads/_views/AdIdeaSlideRow";
import {
  CardEditor,
  CatalogCardLayout,
  IncludeButton,
  ApproveButton,
} from "@/app/app/performance/clients/[brandSlug]/catalog/CatalogCards";
import { CatalogCollectionPreview } from "@/app/app/performance/clients/[brandSlug]/catalog/CatalogPreview";
import {
  IDEA_SHAPE_LABELS,
  ideaDocumentSchema,
  type IdeaDocument,
  type IdeaShape,
} from "@/lib/ad-idea-studio";
import type { CatalogCard } from "@/lib/catalog-studio";
import {
  BRAND,
  HOMES,
  PHOTOS,
  adDrafts,
  artworkUrl,
  catalogCards,
  catalogArtworkUrl,
  type FixtureAd,
  type Scenario,
} from "./data";

function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-1"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={option.value === value ? "secondary" : "ghost"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function CreativeWorkspacesFixture() {
  const [scenario, setScenario] = useState<Scenario>("mixed");
  const [cards, setCards] = useState(() => catalogCards("mixed"));
  const [ads, setAds] = useState(() => adDrafts("mixed"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState("auto");
  const [focus, setFocus] = useState("all");
  const [resetKey, setResetKey] = useState(0);
  const [campaignName, setCampaignName] = useState("Autumn on the coast");
  const [adding, setAdding] = useState(false);
  const [generation, setGeneration] = useState(false);
  const [grouping, setGrouping] = useState("home");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [catalogView, setCatalogView] = useState<
    "cards" | "preview" | "exports"
  >("cards");
  const [catalogFilter, setCatalogFilter] = useState<
    "all" | "review" | "approved"
  >("all");
  const [exported, setExported] = useState(false);
  const assigned = ads.filter((ad) => ad.assigned);
  const changeScenario = (next: Scenario) => {
    setScenario(next);
    setCards(catalogCards(next));
    setAds(adDrafts(next));
    setSelected(new Set());
    setExported(false);
    setResetKey((key) => key + 1);
  };
  const updateAd = (next: FixtureAd) =>
    setAds((current) => current.map((ad) => (ad.id === next.id ? next : ad)));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const canAssign =
    selected.size > 0 &&
    [...selected].every((id) =>
      ads.some((ad) => ad.id === id && ad.approved && !ad.assigned),
    );
  const attach = () => {
    if (!canAssign) return;
    setAds((current) =>
      current.map((ad) =>
        selected.has(ad.id) ? { ...ad, assigned: true } : ad,
      ),
    );
    setSelected(new Set());
    setAdding(false);
  };
  const visible = ads.filter(
    (ad) =>
      (status === "all" ||
        (status === "approved" ? ad.approved : !ad.approved)) &&
      `${ad.name} ${ad.document.copy.body}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const grouped =
    grouping === "none"
      ? [{ name: "All ads", records: visible }]
      : [
          ...new Set(
            visible.map((ad) =>
              grouping === "home"
                ? (ad.homeId ?? "group")
                : ad.document.role === "hero_static"
                  ? "Static"
                  : "Carousel",
            ),
          ),
        ].map((key) => ({
          name:
            grouping === "home"
              ? (HOMES.find((home) => home.id === key)?.name ??
                "Featured homes")
              : key,
          records: visible.filter(
            (ad) =>
              (grouping === "home"
                ? (ad.homeId ?? "group")
                : ad.document.role === "hero_static"
                  ? "Static"
                  : "Carousel") === key,
          ),
        }));
  const columns: {
    id: string;
    title: string;
    subtitle: string;
    content: ReactNode;
  }[] = [
    {
      id: "catalog",
      title: "Catalog",
      subtitle: "One card per home",
      content: (
        <>
          <Pills
            label="Catalog views"
            value={catalogView}
            options={[
              { value: "cards", label: "Cards" },
              { value: "preview", label: "Preview" },
              { value: "exports", label: "Exports" },
            ]}
            onChange={setCatalogView}
          />
          <WorkspaceCard
            title={catalogView === "exports" ? "Exports" : "Catalog cards"}
            icon={Layers}
            count={cards.length}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCards(catalogCards("drafts"))}
                >
                  Prepare catalog
                </Button>
              </>
            }
          >
            {cards.length === 0 ? (
              <EmptyState
                compact
                icon={Layers}
                title="Create the first catalog cards"
                description="Prepare cards from the available homes."
              />
            ) : catalogView === "preview" ? (
              <CatalogCollectionPreview
                brandName={BRAND.name}
                cards={cards
                  .filter((card) => card.included)
                  .map((card) => ({
                    key: card.homeId,
                    image: catalogArtworkUrl(card),
                    name: HOMES.find((home) => home.id === card.homeId)!.name,
                    home: HOMES.find((home) => home.id === card.homeId),
                  }))}
              />
            ) : catalogView === "exports" ? (
              <>
                <Button
                  disabled={
                    !cards.some((card) => card.included) ||
                    cards.some((card) => card.included && !card.approved)
                  }
                  onClick={() => setExported(true)}
                >
                  Preview export
                </Button>
                <p className="text-sm text-muted-foreground">
                  {exported
                    ? `${cards.filter((card) => card.included).length} approved square cards · local export preview`
                    : "Approve included cards to preview the export."}
                </p>
                {exported &&
                  cards
                    .filter((card) => card.included)
                    .map((card) => (
                      <Image
                        key={card.homeId}
                        src={catalogArtworkUrl(card)}
                        alt={card.title}
                        width={400}
                        height={400}
                        unoptimized
                        className="w-full rounded-lg"
                      />
                    ))}
              </>
            ) : (
              <>
                <p className="text-sm">
                  {cards.filter((card) => card.included).length} of{" "}
                  {cards.length} homes included ·{" "}
                  {cards.filter((card) => card.approved).length} approved
                </p>
                <Pills
                  label="Catalog status"
                  value={catalogFilter}
                  options={[
                    { value: "all", label: "Any status" },
                    { value: "review", label: "Needs review" },
                    { value: "approved", label: "Approved" },
                  ]}
                  onChange={setCatalogFilter}
                />
                {cards
                  .filter(
                    (card) =>
                      catalogFilter === "all" ||
                      (catalogFilter === "approved"
                        ? card.approved
                        : !card.approved),
                  )
                  .map((card) => (
                    <CatalogFixtureCard
                      key={card.homeId}
                      card={card}
                      onChange={(next) => {
                        setCards((current) =>
                          current.map((row) =>
                            row.homeId === next.homeId ? next : row,
                          ),
                        );
                        setExported(false);
                      }}
                    />
                  ))}
              </>
            )}
          </WorkspaceCard>
        </>
      ),
    },
    {
      id: "studio",
      title: "Brand Ad Studio",
      subtitle: "The brand’s reusable ad collection",
      content: (
        <>
          <WorkspaceCard
            title="Ads"
            icon={Images}
            count={ads.length}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAds((current) => [
                      ...current,
                      {
                        ...adDrafts("drafts")[0]!,
                        id: crypto.randomUUID(),
                        name: "New ad · Static",
                      },
                    ])
                  }
                >
                  <Plus />
                  Create ad
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGeneration(true)}
                >
                  <House />
                  From home group
                </Button>
              </>
            }
          >
            {ads.length === 0 ? (
              <EmptyState compact icon={Images} title="Create the first ad" />
            ) : (
              <>
                <Input
                  aria-label="Search brand ads"
                  placeholder="Search ads or homes…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Group brand ads"
                    value={grouping}
                    onChange={(event) => setGrouping(event.target.value)}
                    className="rounded-md border bg-background p-2 text-sm"
                  >
                    <option value="home">By home</option>
                    <option value="type">By type</option>
                    <option value="none">No grouping</option>
                  </select>
                  <select
                    aria-label="Filter brand ads"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="rounded-md border bg-background p-2 text-sm"
                  >
                    <option value="all">Any status</option>
                    <option value="review">Needs review</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                {grouped.map((group) => (
                  <div key={group.name} className="space-y-3">
                    <h3 className="text-sm font-medium">
                      {group.name}{" "}
                      <span className="text-muted-foreground">
                        {group.records.length}
                      </span>
                    </h3>
                    {group.records.map((ad) => (
                      <AdFixtureCard
                        key={ad.id}
                        ad={ad}
                        studio
                        onChange={updateAd}
                        selected={selected.has(ad.id)}
                        onSelect={() => toggle(ad.id)}
                        campaignName={campaignName}
                      />
                    ))}
                  </div>
                ))}
                {!visible.length && (
                  <EmptyState
                    compact
                    icon={Images}
                    title="No matching ads"
                    actions={
                      <Button
                        variant="link"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                )}
              </>
            )}
          </WorkspaceCard>
          {selected.size > 0 && (
            <div className="sticky bottom-3 z-10 space-y-2 rounded-xl border bg-background p-3 shadow-lg">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{selected.size} selected</span>
                <Button size="sm" disabled={!canAssign} onClick={attach}>
                  Add to campaign
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
              {!canAssign && (
                <p className="text-xs text-muted-foreground">
                  Freeze selected drafts before assigning them.
                </p>
              )}
            </div>
          )}
        </>
      ),
    },
    {
      id: "campaign",
      title: "Campaign Ad Studio",
      subtitle: "Assigned creative and delivery planning",
      content: (
        <>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Fixture campaign name"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              className="text-base font-semibold"
            />
            <Badge variant="secondary">Draft</Badge>
          </div>
          <WorkspaceCard
            title="Ads"
            icon={Images}
            count={assigned.length}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(true)}
              >
                Add existing ads
              </Button>
            }
          >
            {!assigned.length ? (
              <EmptyState
                compact
                icon={Images}
                title="Add the campaign’s first ads"
                description="Choose existing brand ads or create a new ad."
              />
            ) : (
              assigned.map((ad) => (
                <AdFixtureCard
                  key={ad.id}
                  ad={ad}
                  onChange={updateAd}
                  campaignName={campaignName}
                  onRemove={() => updateAd({ ...ad, assigned: false })}
                />
              ))
            )}
          </WorkspaceCard>
          <WorkspaceCard title="Audiences" icon={Users} count="Broad">
            <EmptyState
              compact
              icon={Users}
              title="Broad"
              description="Keep broad targeting, or add audiences from the brand’s evidence."
            />
          </WorkspaceCard>
          <WorkspaceCard title="Platforms" icon={Radio}>
            <EmptyState
              compact
              icon={Radio}
              title="Choose where the campaign runs"
              description="Prepare account, tracking and budget before delivery."
            />
          </WorkspaceCard>
        </>
      ),
    },
  ];
  return (
    <main className="flex h-dvh flex-col bg-muted/20 text-foreground">
      <header className="space-y-3 border-b bg-background px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/lab/performance-board"
              className="text-xs text-muted-foreground underline"
            >
              Performance vision board
            </Link>
            <h1 className="mt-1 text-xl font-semibold">Creative workspaces</h1>
            <p className="text-xs text-muted-foreground">
              {BRAND.name} · illustrative data · all changes stay in this
              fixture
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => changeScenario(scenario)}
          >
            <RotateCcw />
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Pills
            label="Fixture scenario"
            value={scenario}
            options={[
              { value: "empty", label: "Empty" },
              { value: "drafts", label: "Drafts" },
              { value: "mixed", label: "Mixed review" },
              { value: "approved", label: "Approved" },
              { value: "assigned", label: "Assigned" },
            ]}
            onChange={changeScenario}
          />
          <select
            aria-label="Column width"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            className="rounded-md border bg-background p-2 text-sm"
          >
            <option value="auto">Fit three workspaces</option>
            <option value="420">Compact · 420px</option>
            <option value="560">Workspace · 560px</option>
            <option value="760">Wide · 760px</option>
          </select>
          <select
            aria-label="Focus workspace"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            className="rounded-md border bg-background p-2 text-sm"
          >
            <option value="all">Compare all three</option>
            <option value="catalog">Catalog only</option>
            <option value="studio">Brand Ad Studio only</option>
            <option value="campaign">Campaign Ad Studio only</option>
          </select>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full w-max min-w-full" key={resetKey}>
          {columns
            .filter((column) => focus === "all" || focus === column.id)
            .map((column) => (
              <section
                key={column.id}
                aria-label={column.title}
                style={{
                  width:
                    focus === "all"
                      ? width === "auto"
                        ? "max(440px, calc(100vw / 3))"
                        : Number(width)
                      : "min(100vw, 1000px)",
                }}
                className="@container flex h-full shrink-0 flex-col border-r"
              >
                <header className="sticky top-0 border-b bg-background px-5 py-3">
                  <h2 className="font-semibold">{column.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {column.subtitle}
                  </p>
                </header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {column.content}
                </div>
              </section>
            ))}
        </div>
      </div>
      <SimpleDialog
        open={generation}
        onOpenChange={setGeneration}
        title="Create ads from a home group"
        size="lg"
        footer={
          <Button
            onClick={() => {
              setAds((current) => [
                ...current,
                ...adDrafts("drafts").map((ad) => ({
                  ...ad,
                  id: crypto.randomUUID(),
                })),
              ]);
              setSelected(new Set());
              setGeneration(false);
            }}
          >
            Generate fixture ads
          </Button>
        }
      >
        <p className="text-sm font-medium">Featured homes · 3 homes</p>
        <div className="grid grid-cols-3 gap-3">
          {HOMES.map((home) => (
            <div key={home.id}>
              <Image
                src={home.photo}
                alt={home.name}
                width={200}
                height={150}
                unoptimized
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
              <p className="mt-1 text-xs">{home.name}</p>
            </div>
          ))}
        </div>
        <p className="text-sm">
          7 draft ads · 3 static · 3 home carousels · 1 group carousel · Square
          + Story
        </p>
      </SimpleDialog>
      <SimpleDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add existing ads"
        size="lg"
        footer={
          <Button disabled={!canAssign} onClick={attach}>
            Add {selected.size || ""} selected
          </Button>
        }
      >
        <div className="space-y-2">
          {ads
            .filter((ad) => !ad.assigned)
            .map((ad) => (
              <label
                key={ad.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(ad.id)}
                  disabled={!ad.approved}
                  onChange={() => toggle(ad.id)}
                />
                <span className="flex-1">{ad.name}</span>
                <Badge variant="secondary">
                  {ad.approved ? "Approved" : "Needs review"}
                </Badge>
              </label>
            ))}
          {!ads.some((ad) => !ad.assigned) && (
            <EmptyState compact icon={Images} title="No available brand ads" />
          )}
        </div>
      </SimpleDialog>
    </main>
  );
}

function CatalogFixtureCard({
  card,
  onChange,
}: {
  card: CatalogCard;
  onChange: (card: CatalogCard) => void;
}) {
  const home = HOMES.find((home) => home.id === card.homeId)!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card);
  return (
    <>
      <CatalogCardLayout
        name={home.name}
        approved={card.approved}
        dimmed={!card.included}
        artwork={
          <Image
            src={catalogArtworkUrl(card)}
            alt={card.title}
            width={600}
            height={600}
            unoptimized
            className="w-full object-contain"
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 items-center gap-2">
            {!card.included && <Badge variant="outline">Excluded</Badge>}
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
              <span className="truncate" title={home.name}>
                {home.name}
              </span>
            </p>
          </div>
          {card.mode === "finished" ? (
            <p className="text-sm text-muted-foreground">
              Artwork used as-is, with no added text or logo.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-lg leading-snug font-medium break-words">
                  {card.title || "No headline yet"}
                </p>
                {card.subtitle && (
                  <p className="text-sm text-muted-foreground">
                    {card.subtitle}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-3">
            <Button
              size="xs"
              variant="ghost"
              disabled={card.approved}
              onClick={() =>
                onChange({
                  ...card,
                  imageUrl:
                    PHOTOS[
                      (PHOTOS.indexOf(card.imageUrl) + 1) % PHOTOS.length
                    ]!,
                })
              }
            >
              Choose photo
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <IncludeButton
                card={card}
                onInclude={(included) => onChange({ ...card, included })}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={card.approved}
                onClick={() => {
                  setDraft(structuredClone(card));
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <ApproveButton
                card={card}
                showStatus={false}
                onApprove={(approved) => onChange({ ...card, approved })}
              />
            </div>
          </div>
        </div>
      </CatalogCardLayout>
      <SimpleDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit catalog card · ${home.name}`}
        size="lg"
        scrollable
      >
        <Image
          src={catalogArtworkUrl(draft)}
          alt={draft.title}
          width={400}
          height={400}
          unoptimized
          className="mx-auto w-64 rounded-lg"
        />
        <CardEditor
          card={draft}
          home={undefined}
          onChange={setDraft}
          onHero={(url) =>
            setDraft((current) => ({ ...current, imageUrl: url }))
          }
          onLibrary={() =>
            setDraft((current) => {
              const url =
                PHOTOS[(PHOTOS.indexOf(current.imageUrl) + 1) % PHOTOS.length]!;
              return {
                ...current,
                imageUrl: url,
                ...(current.mode === "finished"
                  ? {
                      finishedArtwork: {
                        assetId: "fixture-artwork",
                        url,
                        format: "square" as const,
                      },
                    }
                  : {}),
              };
            })
          }
          onApply={() => {
            onChange({ ...draft, approved: false });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
        <div className="flex gap-2">
          {PHOTOS.map((photo, index) => (
            <button
              key={photo}
              aria-label={`Use fixture photo ${index + 1}`}
              onClick={() =>
                setDraft((current) => ({ ...current, imageUrl: photo }))
              }
            >
              <Image
                src={photo}
                alt="Fixture photo"
                width={90}
                height={70}
                unoptimized
                className="h-16 w-24 rounded object-cover"
              />
            </button>
          ))}
        </div>
      </SimpleDialog>
    </>
  );
}

function AdFixtureCard({
  ad,
  studio = false,
  selected = false,
  onSelect,
  onChange,
  onRemove,
  campaignName,
}: {
  ad: FixtureAd;
  studio?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onChange: (ad: FixtureAd) => void;
  onRemove?: () => void;
  campaignName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IdeaDocument>(ad.document);
  const [shape, setShape] = useState<IdeaShape>("square");
  const [slide, setSlide] = useState(0);
  const beginEdit = () => {
    setDraft(structuredClone(ad.document));
    setSlide(0);
    setEditing(true);
  };
  const updateSlide = (
    fn: (card: IdeaDocument["cards"][number]) => IdeaDocument["cards"][number],
  ) =>
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card, index) =>
        index === slide ? fn(card) : card,
      ),
    }));
  const cyclePhoto = () =>
    updateSlide((card) => {
      const url = card.sourceOverrides?.[shape]?.url ?? card.source.url;
      return {
        ...card,
        sourceOverrides: {
          ...card.sourceOverrides,
          [shape]: { url: PHOTOS[(PHOTOS.indexOf(url) + 1) % PHOTOS.length]! },
        },
      };
    });
  const home = HOMES.find((row) => row.id === ad.homeId);
  return (
    <article className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        {studio && !ad.assigned && (
          <input
            type="checkbox"
            aria-label={`Select ${ad.name}`}
            checked={selected}
            onChange={onSelect}
          />
        )}
        <h4 className="min-w-0 flex-1 text-sm font-medium">{ad.name}</h4>
        {ad.approved ? (
          <ApprovedStamp />
        ) : (
          <Badge variant="secondary">Draft</Badge>
        )}
      </div>
      {ad.assigned && studio && (
        <p className="text-xs text-muted-foreground">{campaignName}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={ad.approved}
          onClick={beginEdit}
        >
          Edit ad
        </Button>
        <Button
          size="sm"
          variant={ad.approved ? "outline" : "default"}
          onClick={() => onChange({ ...ad, approved: !ad.approved })}
        >
          {ad.approved ? "Reopen" : studio ? "Freeze" : "Approve"}
        </Button>
        {onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove from campaign
          </Button>
        )}
      </div>
      <AdIdeaPreview
        studio={{ document: ad.document }}
        brandId={BRAND.id}
        brandName={BRAND.name}
        brandLogo={null}
        resolvePreview={artworkUrl}
        home={
          home
            ? { name: home.name, url: `${BRAND.website}/${home.id}` }
            : undefined
        }
        onExpand={ad.approved ? undefined : beginEdit}
      />
      <SimpleDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ad · ${ad.name}`}
        size="lg"
        scrollable
        footer={
          <>
            <Button
              disabled={
                !draft.exportShapes?.length ||
                !ideaDocumentSchema.safeParse(draft).success
              }
              onClick={() => {
                onChange({ ...ad, document: draft, approved: false });
                setEditing(false);
              }}
            >
              Apply changes
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            Headline
            <Input
              value={draft.copy.headline}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  copy: { ...current.copy, headline: event.target.value },
                }))
              }
            />
          </label>
          <label className="block space-y-1 text-sm">
            Primary text
            <Textarea
              value={draft.copy.body}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  copy: { ...current.copy, body: event.target.value },
                }))
              }
            />
          </label>
          <label className="block space-y-1 text-sm">
            Booking destination
            <Input
              value={draft.copy.linkUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  copy: { ...current.copy, linkUrl: event.target.value },
                }))
              }
            />
          </label>
        </div>
        <div
          role="group"
          aria-label="Export sizes"
          className="flex flex-wrap gap-3"
        >
          {(["square", "story", "portrait", "wide"] as const).map((size) => (
            <label key={size} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.exportShapes?.includes(size)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    exportShapes: event.target.checked
                      ? [...(current.exportShapes ?? []), size]
                      : (current.exportShapes ?? []).filter(
                          (value) => value !== size,
                        ),
                  }))
                }
              />
              {IDEA_SHAPE_LABELS[size]}
            </label>
          ))}
        </div>
        <select
          aria-label="Edit artwork size"
          value={shape}
          onChange={(event) => setShape(event.target.value as IdeaShape)}
          className="rounded-md border bg-background p-2 text-sm"
        >
          {(["square", "story", "portrait", "wide"] as const).map((size) => (
            <option key={size} value={size}>
              {IDEA_SHAPE_LABELS[size]}
            </option>
          ))}
        </select>
        {draft.cards.length > 1 && (
          <Pills
            label="Edit slide"
            value={String(slide)}
            options={draft.cards.map((card, index) => ({
              value: String(index),
              label: `Slide ${index + 1}`,
            }))}
            onChange={(value) => setSlide(Number(value))}
          />
        )}
        {draft.cards[slide] && (
          <AdIdeaSlideRow
            card={draft.cards[slide]}
            brandId={BRAND.id}
            name={ad.name}
            shape={shape}
            index={slide}
            count={draft.cards.length}
            isStatic={draft.role === "hero_static"}
            uploading={0}
            progress={[]}
            editing
            onEdit={() => setEditing(true)}
            frozenUrl={artworkUrl(draft.cards[slide], shape)}
            adCopy={draft.copy}
            onChange={updateSlide}
            onReplace={cyclePhoto}
            onChoosePool={cyclePhoto}
            onUpload={async (files) => {
              const file = files[0];
              if (!file) return;
              const url = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") resolve(reader.result);
                  else reject(new Error("Image data unavailable"));
                };
                reader.onerror = () =>
                  reject(new Error("Could not read local image"));
                reader.readAsDataURL(file);
              });
              updateSlide((card) => ({
                ...card,
                mode: "supplied",
                source: { url },
              }));
            }}
            onMove={(direction) => {
              const next = slide + direction;
              if (next < 0 || next >= draft.cards.length) return;
              setDraft((current) => {
                const cards = [...current.cards];
                [cards[slide], cards[next]] = [cards[next]!, cards[slide]!];
                return { ...current, cards };
              });
              setSlide(next);
            }}
            onRemove={() => {
              if (draft.cards.length <= 1) return;
              setDraft((current) => ({
                ...current,
                cards: current.cards.filter((_, index) => index !== slide),
              }));
              setSlide(Math.max(0, slide - 1));
            }}
          />
        )}
      </SimpleDialog>
    </article>
  );
}
