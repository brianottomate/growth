"use client";
import { catalogAddressIssues } from "@/lib/catalog-addresses";
import { useEffect, useRef, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Check,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import {
  COMPOSITION_FORMATS,
  COMPOSITION_IMAGE_POSITIONS,
  COMPOSITION_TEMPLATES,
} from "@/lib/compositions";
import {
  CATALOG_WRITE_PASSES,
  catalogArtworkIssues,
  catalogCardFingerprint,
  catalogCardPreviewUrl,
  catalogUnapproved,
  type CatalogCard,
  type CatalogExport,
  type CatalogHome,
  type CatalogFormatId,
  DEFAULT_CATALOG_FORMAT,
} from "@/lib/catalog-studio";
import { safeHomeUrl } from "@/lib/ad-preview-links";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { orpc, type RouterInputs } from "@/orpc/client";
import { reviewInChat } from "../ReviewInChatButton";
import { CatalogPreview } from "./CatalogPreview";
import {
  CatalogTemplateCard,
  CatalogTemplateSummary,
} from "../CatalogTemplateCard";

/** The server's own sentence, or the first input issue it refused. */
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ORPCError) {
    const issues = (error.data as { issues?: { message?: string }[] } | null)
      ?.issues;
    return issues?.[0]?.message ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}
const running = (status?: string) =>
  status === "queued" || status === "processing";
/**
 * A local dev server may change approved cards. Exporting unapproved ones is
 * `scripts/export-catalog-unapproved.ts`.
 */
const DEV = process.env.NODE_ENV === "development";
const FORCE = DEV ? { force: true } : {};
/** Approved cards are signed off; they change only after Reopen. */
const locked = (card: CatalogCard) => Boolean(card.approved) && !DEV;
const LOCKED_TITLE = "Approved. Reopen it to change it.";
const preview = catalogCardPreviewUrl;
export function CatalogCards({
  brandId,
  brandName = "",
  heroHomeId = null,
}: {
  brandId: string;
  brandName?: string;
  /** The brand's hero home, drawn in the card picker. */
  heroHomeId?: string | null;
}) {
  const client = useQueryClient();
  const state = orpc.catalog.state.queryOptions({ input: { brandId } });
  const query = useQuery({
    ...state,
    refetchInterval: (q) =>
      q.state.data?.exports.some((e) => running(e.status)) ? 2500 : false,
  });
  const writeStatus = orpc.catalog.writeStatus.queryOptions({
    input: { brandId },
  });
  const writeRun = useQuery({
    ...writeStatus,
    refetchInterval: (q) => (running(q.state.data?.run?.status) ? 2500 : false),
  }).data?.run;
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["studio", "preview", "exports"]).withDefault(
      "studio",
    ),
  );
  /** A home to scroll to in Studio, set by the links on an export's images. */
  const [focusHome, setFocusHome] = useQueryState("home", parseAsString);
  const [layout, setLayout] = useState<"grid" | "list">("list");
  const [details, setDetails] = useState<CatalogCard | null>(null);
  const [gridExports, setGridExports] = useState<string[]>([]);
  const [deletingExport, setDeletingExport] = useState<CatalogExport | null>(
    null,
  );
  const [fresh, setFresh] = useState(false);
  const [library, setLibrary] = useState(false);
  /** A card whose photo is being swapped straight from its row, saved on pick. */
  const [picking, setPicking] = useState<CatalogCard | null>(null);
  const [limit, setLimit] = useState(10);
  const [filter, setFilter] = useQueryState(
    "filter",
    parseAsStringLiteral(["all", "review", "approved"]).withDefault("all"),
  );
  /** Cards with a New copy or New photo call in flight. */
  const [fixing, setFixing] = useState<Record<string, "copy" | "photo">>({});
  const [busy, setBusy] = useState(false);
  /** The catalog card accordion. */
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const draft = query.data?.draft;
  const format = query.data?.format ?? DEFAULT_CATALOG_FORMAT;
  const homes = query.data?.homes ?? [];
  const homeOf = (card: CatalogCard) => homes.find((h) => h.id === card.homeId);
  const reload = () => client.invalidateQueries({ queryKey: state.queryKey });
  // Chat edits the same rows; show its writes as they land.
  useEffect(() => {
    const onWrite = () => {
      void client.invalidateQueries({ queryKey: state.queryKey });
      void client.invalidateQueries({ queryKey: writeStatus.queryKey });
    };
    window.addEventListener("growth:write", onWrite);
    return () => window.removeEventListener("growth:write", onWrite);
  }, [client, state.queryKey, writeStatus.queryKey]);
  async function act(request: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      const result = await request();
      await reload();
      return result;
    } catch (e) {
      setError(errorMessage(e, fallback));
      return null;
    }
  }
  async function quickFix(card: CatalogCard, kind: "copy" | "photo") {
    setFixing((f) => ({ ...f, [card.homeId]: kind }));
    const input = { brandId, homeId: card.homeId, ...FORCE };
    await act(
      () =>
        kind === "copy"
          ? orpc.catalog.newCopy.call(input)
          : orpc.catalog.newPhoto.call(input),
      kind === "copy" ? "Unable to write new copy" : "Unable to find a photo",
    );
    setFixing(({ [card.homeId]: _, ...rest }) => rest);
  }
  const workInChat = (card: CatalogCard, focus?: "photo" | "copy") => {
    const homeName = homeOf(card)?.name ?? "this home";
    sendAssistantIntent({
      type: "work_catalog_home",
      brandId,
      brandName,
      homeId: card.homeId,
      homeName,
      focus,
      visibleText:
        focus === "photo"
          ? `Pick a better hero photo for ${homeName}`
          : focus === "copy"
            ? `Write a better catalog headline for ${homeName}`
            : `Let's work on ${homeName}'s catalog card`,
    });
  };
  async function setHero(card: CatalogCard, photoUrl: string) {
    const done = await act(
      () =>
        orpc.catalog.setHero.call({
          brandId,
          homeId: card.homeId,
          photoUrl,
          ...FORCE,
        }),
      "Unable to set the hero",
    );
    if (done)
      setDetails((d) =>
        d?.homeId === card.homeId
          ? { ...d, imageUrl: photoUrl, assetId: undefined }
          : d,
      );
  }
  /** Finished artwork comes from the library; a composition from the home's photos first. */
  const choosePhoto = (card: CatalogCard) => {
    setPicking(card);
    if (card.mode === "finished") setLibrary(true);
  };
  /** Save what changed on one card to its home's row. */
  const update = (next: CatalogCard) => {
    const prev = draft?.cards.find((c) => c.homeId === next.homeId);
    if (!prev) return;
    const patch = cardPatch(prev, next);
    if (Object.keys(patch).length)
      void act(
        () =>
          orpc.catalog.editCard.call({
            brandId,
            homeId: next.homeId,
            ...patch,
            ...FORCE,
          }),
        "Unable to save the card",
      );
  };
  /** Sign cards off as shown, or take it back; the server refuses stale ones. */
  const approve = (cards: CatalogCard[], approved: boolean) =>
    void act(
      () =>
        orpc.catalog.setApproval.call({
          brandId,
          approved,
          cards: cards.map((card) => ({
            homeId: card.homeId,
            fingerprint: catalogCardFingerprint(card),
          })),
        }),
      "Unable to update approval",
    );
  // Every card still open for changes: included, not signed off, drawn by
  // us rather than supplied as finished artwork.
  const open = (draft?.cards ?? [])
    .filter((c) => c.included && !c.approved && c.mode !== "finished")
    .map((c) => c.homeId);
  const startWrite = useMutation(
    orpc.catalog.writeCards.mutationOptions({
      onMutate: () => setError(""),
      onSuccess: ({ run }) =>
        client.setQueryData(writeStatus.queryKey, { run }),
      onError: (e) => setError(errorMessage(e, "Unable to write the cards")),
    }),
  );
  // Follow the run: cards fill in as they land, and a finished run says what
  // it could not do.
  const lastRun = useRef<{ id: string; status: string; batch: number }>(null);
  useEffect(() => {
    if (!writeRun) return;
    const last = lastRun.current;
    const batch = Math.floor(writeRun.done / 5);
    lastRun.current = { id: writeRun.runId, status: writeRun.status, batch };
    if (last?.id !== writeRun.runId) return;
    if (last.status === writeRun.status && last.batch === batch) return;
    void client.invalidateQueries({ queryKey: state.queryKey });
    if (!running(last.status) || running(writeRun.status)) return;
    const { failed, left } = writeRun;
    if (writeRun.status === "error")
      setError(writeRun.error ?? "Unable to write the cards");
    else if (failed || left)
      setError(
        [
          failed
            ? `${failed} card${failed === 1 ? "" : "s"} could not be written; New copy on the card retries it.`
            : "",
          left
            ? `${left} card${left === 1 ? " was" : "s were"} not reached in time; run it again for the rest.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
  }, [writeRun, client, state.queryKey]);
  const writing = running(writeRun?.status)
    ? writeRun
    : startWrite.isPending
      ? { pass: startWrite.variables?.pass, done: 0, total: open.length }
      : null;
  const unapproved = draft ? catalogUnapproved(draft) : [];
  const approvedCards = (draft?.cards ?? []).filter(
    (c) => c.included && c.approved,
  );
  const visible =
    filter === "review"
      ? unapproved
      : filter === "approved"
        ? approvedCards
        : (draft?.cards ?? []);
  useEffect(() => {
    if (view !== "studio" || !focusHome || !draft) return;
    const index = visible.findIndex((card) => card.homeId === focusHome);
    if (index < 0) {
      if (filter !== "all") void setFilter("all");
      return;
    }
    if (index >= limit) {
      setLimit(index + 1);
      return;
    }
    document
      .getElementById(`home-${focusHome}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [view, focusHome, draft, visible, filter, limit, setFilter]);
  async function exportCatalog() {
    setBusy(true);
    const done = await act(
      () => orpc.catalog.exportCatalog.call({ brandId, fresh }),
      "Unable to export",
    );
    if (done) void setView("exports");
    setBusy(false);
  }
  const activeExport = query.data?.exports.some((e) => running(e.status));
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Catalog</h2>
        <div className="flex gap-2">
          <Button
            variant={view === "studio" ? "secondary" : "ghost"}
            onClick={() => setView("studio")}
          >
            Studio
          </Button>
          <Button
            variant={view === "preview" ? "secondary" : "ghost"}
            onClick={() => setView("preview")}
          >
            Preview
          </Button>
          <Button
            variant={view === "exports" ? "secondary" : "ghost"}
            onClick={() => setView("exports")}
          >
            Exports {query.data?.exports.length || ""}
          </Button>
        </div>
      </div>
      {(error || query.error) && (
        <p role="alert" className="text-destructive">
          {error || query.error?.message}
        </p>
      )}
      {query.data?.enrichmentError && (
        <p className="text-sm text-muted-foreground">
          {query.data.enrichmentError}
        </p>
      )}
      {query.isLoading && <p>Loading homes…</p>}
      {view === "studio" && draft && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {draft.cards.filter((c) => c.included).length} of{" "}
              {draft.cards.length} homes included ·{" "}
              {draft.cards.filter((c) => c.included && c.approved).length}{" "}
              approved
            </span>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {writing
                      ? `${writing.pass === "copy" ? "Rewriting" : "Fixing"} ${writing.done}/${writing.total}`
                      : "Bulk actions"}
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem
                    onSelect={() =>
                      reviewInChat({ brandId, brandName, surface: "catalog" })
                    }
                  >
                    <MessageSquare aria-hidden="true" />
                    Review in chat
                  </DropdownMenuItem>
                  {CATALOG_WRITE_PASSES.map((pass) => (
                    <DropdownMenuItem
                      key={pass}
                      disabled={busy || Boolean(writing) || open.length === 0}
                      onSelect={() => startWrite.mutate({ brandId, pass })}
                    >
                      <Sparkles aria-hidden="true" />
                      {pass === "copy" ? "Rewrite copy" : "Fix photos + copy"}
                      <DropdownMenuShortcut>{open.length}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {([true, false] as const).map((included) => (
                    <DropdownMenuItem
                      key={String(included)}
                      disabled={busy}
                      onSelect={() =>
                        void act(
                          () =>
                            orpc.catalog.setIncluded.call({
                              brandId,
                              included,
                            }),
                          "Unable to update the catalog",
                        )
                      }
                    >
                      {included ? "Include all" : "Exclude all"}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy || unapproved.length === 0}
                    onSelect={() => approve(unapproved, true)}
                  >
                    <Check aria-hidden="true" />
                    Approve all
                    <DropdownMenuShortcut>
                      {unapproved.length}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fresh}
                  onChange={(e) => setFresh(e.target.checked)}
                />
                Redraw every card
              </label>
              <Button
                disabled={
                  busy ||
                  activeExport ||
                  !draft.cards.some((c) => c.included) ||
                  catalogArtworkIssues(draft).length > 0 ||
                  unapproved.length > 0
                }
                title={
                  unapproved.length > 0
                    ? `${unapproved.length} included card${unapproved.length === 1 ? "" : "s"} not approved yet`
                    : undefined
                }
                onClick={() => void exportCatalog()}
              >
                {busy ? "Working…" : "Create export"}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border">
            <button
              type="button"
              aria-expanded={picker}
              onClick={() => setPicker((o) => !o)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm"
            >
              <CatalogTemplateSummary
                brandId={brandId}
                heroHomeId={heroHomeId}
              />
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform",
                  picker && "rotate-180",
                )}
              />
            </button>
            {picker ? (
              <div className="border-t p-3">
                <CatalogTemplateCard
                  brandId={brandId}
                  heroHomeId={heroHomeId}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex rounded-lg border p-0.5">
              {(["grid", "list"] as const).map((l) => (
                <Button
                  key={l}
                  variant={layout === l ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={layout === l}
                  onClick={() => {
                    setLayout(l);
                    setDetails(null);
                  }}
                >
                  {l === "grid" ? "Compact" : "List"}
                </Button>
              ))}
            </div>
            <div className="flex rounded-lg border p-0.5">
              {(["all", "review", "approved"] as const).map((key) => (
                <Button
                  key={key}
                  variant={filter === key ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key === "review"
                    ? `Needs review ${unapproved.length}`
                    : key === "approved"
                      ? `Approved ${approvedCards.length}`
                      : "All"}
                </Button>
              ))}
            </div>
          </div>
          {catalogArtworkIssues(draft).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {catalogArtworkIssues(draft).join(" · ")}
            </p>
          )}
          {!draft.cards.length && (
            <p className="text-muted-foreground">
              No homes with photos found on this brand’s WanderOS site.
            </p>
          )}
          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @2xl:gap-4 @4xl:grid-cols-3 @6xl:grid-cols-4">
              {visible.slice(0, limit).map((card) => (
                <div
                  key={card.homeId}
                  id={`home-${card.homeId}`}
                  className={`scroll-mt-20 overflow-hidden rounded-xl border bg-card ${card.included ? "" : "opacity-50"} ${focusHome === card.homeId ? "ring-2 ring-ring" : ""}`}
                >
                  <button
                    className="block w-full"
                    disabled={locked(card)}
                    title={locked(card) ? LOCKED_TITLE : undefined}
                    onClick={() => setDetails({ ...card })}
                    aria-label={`Edit ${homeOf(card)?.name}`}
                  >
                    <CardPreview
                      brandId={brandId}
                      card={card}
                      format={format}
                    />
                  </button>
                  {card.mode === "finished" && (
                    <p className="px-3 pt-2 text-xs text-muted-foreground">
                      Artwork
                      {card.finishedArtwork ? "" : " · Choose image"}
                    </p>
                  )}
                  <div className="flex items-end justify-between gap-2 p-3">
                    <button
                      className="line-clamp-2 text-left text-sm"
                      title={locked(card) ? LOCKED_TITLE : homeOf(card)?.name}
                      disabled={locked(card)}
                      onClick={() => setDetails({ ...card })}
                    >
                      {homeOf(card)?.name}
                    </button>
                    <HomeLink url={homeOf(card)?.url} />
                    <IncludeButton
                      card={card}
                      onInclude={(included) => update({ ...card, included })}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.slice(0, limit).map((card) => {
                const editing = details?.homeId === card.homeId;
                const shown = editing ? details : card;
                return (
                  <section
                    key={card.homeId}
                    id={`home-${card.homeId}`}
                    aria-label={homeOf(card)?.name}
                    className={`scroll-mt-20 rounded-lg border p-4 ${card.included || editing ? "" : "opacity-50"} ${focusHome === card.homeId ? "ring-2 ring-ring" : ""}`}
                  >
                    <div className="grid grid-cols-1 items-start gap-5 @xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                      <div className="mx-auto w-full max-w-xs overflow-hidden rounded-lg">
                        <CardPreview
                          brandId={brandId}
                          card={shown}
                          format={format}
                        />
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {homeOf(card)?.name}
                            <HomeLink url={homeOf(card)?.url} />
                          </p>
                          {!editing && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => workInChat(card)}
                              >
                                <MessageSquare className="size-3.5" />
                                Work in chat
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={locked(card)}
                                title={locked(card) ? LOCKED_TITLE : undefined}
                                onClick={() => setDetails({ ...card })}
                              >
                                Edit
                              </Button>
                            </div>
                          )}
                        </div>
                        {editing ? (
                          <CardEditor
                            card={details}
                            home={homeOf(card)}
                            onChange={setDetails}
                            onHero={(photoUrl) =>
                              void setHero(details, photoUrl)
                            }
                            onLibrary={() => setLibrary(true)}
                            onApply={() => {
                              update({ ...details, included: card.included });
                              setDetails(null);
                            }}
                            onCancel={() => setDetails(null)}
                          />
                        ) : card.mode === "finished" ? (
                          <p className="text-sm text-muted-foreground">
                            Artwork used as-is, with no added text or logo.
                          </p>
                        ) : (
                          <dl className="space-y-3 text-sm">
                            {[
                              ["Headline", card.title],
                              ["Facts", card.subtitle],
                              [
                                "Composition",
                                COMPOSITION_TEMPLATES.find(
                                  (t) => t.id === card.templateId,
                                )?.label ?? card.templateId,
                              ],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt className="text-xs text-muted-foreground">
                                  {label}
                                </dt>
                                <dd className="break-words">
                                  {value || "Not set"}
                                </dd>
                              </div>
                            ))}
                            <Amenities list={homeOf(card)?.amenities ?? []} />
                          </dl>
                        )}
                        {!editing && (
                          <div className="flex flex-wrap items-center gap-1 border-t pt-3">
                            <span className="mr-1.5 text-xs text-muted-foreground">
                              Quick changes
                            </span>
                            {(
                              [
                                ["Choose photo", () => choosePhoto(card)],
                                [
                                  fixing[card.homeId] === "photo"
                                    ? "Finding a photo…"
                                    : "New photo",
                                  () => void quickFix(card, "photo"),
                                ],
                                [
                                  fixing[card.homeId] === "copy"
                                    ? "Writing copy…"
                                    : "New copy",
                                  () => void quickFix(card, "copy"),
                                ],
                              ] as const
                            ).map(([label, onClick]) => (
                              <Button
                                key={label}
                                size="xs"
                                variant="ghost"
                                disabled={
                                  Boolean(fixing[card.homeId]) || locked(card)
                                }
                                title={locked(card) ? LOCKED_TITLE : undefined}
                                onClick={onClick}
                              >
                                {label}
                              </Button>
                            ))}
                            <div className="ml-auto flex gap-2">
                              <IncludeButton
                                card={card}
                                onInclude={(included) =>
                                  update({ ...card, included })
                                }
                              />
                              <ApproveButton
                                card={card}
                                onApprove={(approved) =>
                                  approve([card], approved)
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {limit < visible.length && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setLimit(limit + 10)}>
                Load more homes
              </Button>
              <Button
                variant="outline"
                onClick={() => setLimit(visible.length)}
              >
                Load all homes
              </Button>
            </div>
          )}
        </>
      )}
      {view === "preview" && draft && (
        <CatalogPreview
          brandId={brandId}
          brandName={brandName}
          homes={homes}
          draft={draft}
        />
      )}
      {view === "exports" && (
        <div className="space-y-5">
          {!query.data?.exports.length && (
            <p className="text-muted-foreground">
              No exports yet. Review the Studio cards and create your first
              export.
            </p>
          )}
          {query.data?.exports.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">
                    {item.label ? `${item.label} · ` : ""}
                    {new Date(item.createdAt).toLocaleString()}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.status === "ready"
                      ? `${item.rows?.length} homes · ${item.assets?.length} images${item.assets?.some((a) => a.reused) ? ` · ${item.assets.filter((a) => a.reused).length} unchanged, copied from the last export` : ""}`
                      : item.status === "error"
                        ? "Export failed"
                        : `Rendering ${item.completed ?? 0} of ${item.total ?? 0} images…`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {item.status === "ready" &&
                    ["csv", "xlsx"].map((type) => (
                      <a
                        className="underline"
                        key={type}
                        href={`/api/performance/catalog/${brandId}/exports/${item.id}?format=${type}`}
                      >
                        Download {type.toUpperCase()}
                      </a>
                    ))}
                  {item.folderId && (
                    <a
                      className="underline"
                      href={`/app/media?brand=${brandId}&folder=${item.folderId}`}
                    >
                      Open in media library
                    </a>
                  )}
                  {Boolean(item.assets?.length) && (
                    <button
                      type="button"
                      className="underline"
                      aria-expanded={gridExports.includes(item.id)}
                      onClick={() =>
                        setGridExports((open) =>
                          open.includes(item.id)
                            ? open.filter((id) => id !== item.id)
                            : [...open, item.id],
                        )
                      }
                    >
                      {gridExports.includes(item.id)
                        ? "Show as row"
                        : "Show all"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-destructive underline"
                    onClick={() => setDeletingExport(item)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {item.error && (
                <p role="alert" className="text-destructive">
                  {item.error}
                </p>
              )}
              {item.status === "ready" && (
                <p className="text-xs text-muted-foreground">
                  {catalogAddressIssues(item.rows ?? []).length
                    ? catalogAddressIssues(item.rows ?? []).join(" · ")
                    : "Addresses and coordinates saved with this export."}
                </p>
              )}
              <div
                className={
                  gridExports.includes(item.id)
                    ? "grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3"
                    : "flex gap-3 overflow-x-auto"
                }
              >
                {item.assets?.map((a) => (
                  <div
                    key={a.assetId}
                    className={
                      gridExports.includes(item.id)
                        ? "min-w-0"
                        : "w-32 shrink-0"
                    }
                  >
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <img
                        src={a.url}
                        alt={`${a.name} · ${a.format}`}
                        loading="lazy"
                        className="aspect-square w-full rounded bg-muted object-contain"
                      />
                    </a>
                    <button
                      type="button"
                      title="Open this home in Studio"
                      className="mt-1 text-left text-xs underline-offset-2 hover:underline"
                      onClick={() => {
                        void setFocusHome(a.homeId);
                        void setView("studio");
                      }}
                    >
                      {a.name} · {a.format}
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <DeleteAlert
        open={deletingExport !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingExport(null);
        }}
        onConfirm={async () => {
          const target = deletingExport;
          if (!target) return;
          await act(
            () => orpc.catalog.deleteExport.call({ brandId, runId: target.id }),
            "Unable to delete the export",
          );
          setDeletingExport(null);
        }}
        title="Delete this export?"
        description={`This deletes the export, its media library folder and ${deletingExport?.assets?.length ?? 0} images for good. Other exports keep their own copies.`}
      />
      <Dialog
        open={layout === "grid" && !!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{details && homeOf(details)?.name}</DialogTitle>
            <DialogDescription>
              Edit the catalog artwork. Listing facts stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="grid gap-6 md:grid-cols-2">
              <CardPreview brandId={brandId} card={details} format={format} />
              <CardEditor
                card={details}
                home={homeOf(details)}
                onChange={setDetails}
                onHero={(photoUrl) => void setHero(details, photoUrl)}
                onLibrary={() => setLibrary(true)}
                onApply={() => {
                  update(details);
                  setDetails(null);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!picking && !library}
        onOpenChange={(open) => {
          if (!open) setPicking(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{picking && homeOf(picking)?.name}</DialogTitle>
            <DialogDescription>Photos from this home</DialogDescription>
          </DialogHeader>
          {picking && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {homeOf(picking)?.gallery?.map((photo) => {
                  const current =
                    !picking.assetId && photo.url === picking.imageUrl;
                  return (
                    <button
                      key={photo.url}
                      aria-label="Use this photo"
                      aria-pressed={current}
                      onClick={() => {
                        const card = picking;
                        setPicking(null);
                        void setHero(card, photo.url);
                      }}
                    >
                      <img
                        src={photo.thumbUrl}
                        alt="Home photo"
                        className={`aspect-square w-full rounded object-cover ${current ? "ring-2 ring-foreground" : ""}`}
                      />
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" onClick={() => setLibrary(true)}>
                Choose from library or upload
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <MediaPickerDialog
        brandId={brandId}
        open={library}
        onOpenChange={(open) => {
          setLibrary(open);
          if (!open) setPicking(null);
        }}
        existingAssetIds={[]}
        onPick={(item) => {
          if (picking && item.type === "image" && item.assetId) {
            const card = picking;
            setPicking(null);
            setLibrary(false);
            const assetId = item.assetId;
            void act(
              () =>
                orpc.catalog.editCard.call({
                  brandId,
                  homeId: card.homeId,
                  ...(card.mode === "finished"
                    ? { finishedAssetId: assetId }
                    : { imageAssetId: assetId }),
                  ...FORCE,
                }),
              "Unable to save the photo",
            );
            return;
          }
          if (details && item.type === "image" && item.assetId) {
            setDetails(
              details.mode === "finished"
                ? {
                    ...details,
                    finishedArtwork: {
                      assetId: item.assetId,
                      url: item.url,
                      format,
                    },
                  }
                : { ...details, imageUrl: item.url, assetId: item.assetId },
            );
            setLibrary(false);
          }
        }}
      />
    </section>
  );
}

/** Put a home in the export or take it out. */
function IncludeButton({
  card,
  onInclude,
}: {
  card: CatalogCard;
  onInclude: (included: boolean) => void;
}) {
  return (
    <Button size="sm" variant="ghost" onClick={() => onInclude(!card.included)}>
      {card.included ? "Exclude" : "Include"}
    </Button>
  );
}

/** Sign one card off as it stands, or take the sign-off back. */
function ApproveButton({
  card,
  onApprove,
}: {
  card: CatalogCard;
  onApprove: (approved: boolean) => void;
}) {
  return (
    <Button
      size="sm"
      variant={card.approved ? "secondary" : "outline"}
      aria-pressed={Boolean(card.approved)}
      disabled={!card.included}
      title={card.approved ? "Reopen to change it" : undefined}
      onClick={() => onApprove(!card.approved)}
    >
      {card.approved && <Check aria-hidden="true" className="size-3.5" />}
      {card.approved ? "Approved" : "Approve"}
    </Button>
  );
}

function CardPreview({
  brandId,
  card,
  format,
}: {
  brandId: string;
  card: CatalogCard;
  format: CatalogFormatId;
}) {
  const src =
    card.mode === "finished" || card.title.trim()
      ? preview(brandId, card, format)
      : undefined;
  const empty = card.mode === "finished" ? "Choose artwork" : "Add a headline";
  return (
    <PreviewImage
      key={src ?? empty}
      src={src}
      alt={card.title}
      empty={empty}
      format={format}
    />
  );
}

function PreviewImage({
  src,
  alt,
  empty,
  format,
}: {
  src: string | undefined;
  alt: string;
  empty: string;
  format: CatalogFormatId;
}) {
  const [failed, setFailed] = useState(false);
  const size = COMPOSITION_FORMATS.find((f) => f.id === format)!;
  const aspectRatio = `${size.width}/${size.height}`;
  if (!src || failed)
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground"
        style={{ aspectRatio }}
      >
        {src ? "Preview unavailable" : empty}
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full rounded-lg object-contain"
      style={{ aspectRatio }}
      onError={() => setFailed(true)}
    />
  );
}

function CardEditor({
  card,
  home,
  onChange,
  onHero,
  onLibrary,
  onApply,
  onCancel,
}: {
  card: CatalogCard;
  home: CatalogHome | undefined;
  onChange: (card: CatalogCard) => void;
  /** Make a photo the home's hero, which every surface draws on. */
  onHero: (photoUrl: string) => void;
  onLibrary: () => void;
  onApply: () => void;
  onCancel?: () => void;
}) {
  const homeUrl = safeHomeUrl(home?.url);
  return (
    <div className="space-y-4">
      {homeUrl ? (
        <a
          href={homeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View home
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ) : null}
      <label className="block space-y-1 text-sm">
        Artwork
        <select
          className="block w-full rounded border bg-background p-2"
          value={card.mode ?? "compose"}
          onChange={(e) =>
            onChange({
              ...card,
              mode: e.target.value as "compose" | "finished",
            })
          }
        >
          <option value="compose">Composed</option>
          <option value="finished">Artwork</option>
        </select>
      </label>
      {card.mode === "finished" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use the original image as-is. Text and branding are already part of
            the image. Your composition is kept if you switch back.
          </p>
          <Button variant="outline" onClick={onLibrary}>
            Choose artwork
          </Button>
        </div>
      ) : (
        <>
          <label className="block space-y-1 text-sm">
            Headline
            <Input
              value={card.title}
              maxLength={120}
              onChange={(e) => onChange({ ...card, title: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Facts
            <Input
              value={card.subtitle}
              maxLength={220}
              onChange={(e) => onChange({ ...card, subtitle: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Composition
            <select
              className="block w-full rounded border bg-background p-2"
              value={card.templateId}
              onChange={(e) =>
                onChange({
                  ...card,
                  templateId: e.target.value as CatalogCard["templateId"],
                })
              }
            >
              {COMPOSITION_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Crop focus
            <select
              className="ml-2 rounded border bg-background p-2"
              value={card.imagePosition}
              onChange={(e) =>
                onChange({
                  ...card,
                  imagePosition: e.target.value as CatalogCard["imagePosition"],
                })
              }
            >
              {COMPOSITION_IMAGE_POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={card.showLogo}
              onChange={(e) =>
                onChange({ ...card, showLogo: e.target.checked })
              }
            />
            Include brand logo
          </label>
          <Button variant="outline" onClick={onLibrary}>
            Choose from library or upload
          </Button>
          <div>
            <p className="mb-2 text-sm">Hero photo for this home</p>
            <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto">
              {home?.gallery?.map((photo) => (
                <button
                  key={photo.url}
                  aria-label="Make this the hero photo"
                  aria-pressed={!card.assetId && photo.url === card.imageUrl}
                  onClick={() => onHero(photo.url)}
                >
                  <img
                    src={photo.thumbUrl}
                    alt="Home photo"
                    className={`aspect-square w-full rounded object-cover ${!card.assetId && photo.url === card.imageUrl ? "ring-2 ring-foreground" : ""}`}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <Button
          disabled={
            !card.title.trim() ||
            (card.mode === "finished" && !card.finishedArtwork)
          }
          onClick={onApply}
        >
          Apply changes
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/** The row fields a card edit changes; null puts one back on its default. */
function cardPatch(prev: CatalogCard, next: CatalogCard) {
  const patch: Omit<RouterInputs["catalog"]["editCard"], "brandId" | "homeId"> =
    {};
  if (prev.title !== next.title) patch.title = next.title;
  if (prev.subtitle !== next.subtitle) patch.subtitle = next.subtitle;
  if (prev.templateId !== next.templateId) patch.templateId = next.templateId;
  if (prev.imagePosition !== next.imagePosition)
    patch.imagePosition = next.imagePosition;
  if (prev.showLogo !== next.showLogo) patch.showLogo = next.showLogo;
  if (prev.included !== next.included) patch.included = next.included;
  if ((prev.mode ?? "compose") !== (next.mode ?? "compose"))
    patch.mode = next.mode ?? null;
  if (prev.assetId !== next.assetId) patch.imageAssetId = next.assetId ?? null;
  if (prev.finishedArtwork?.assetId !== next.finishedArtwork?.assetId)
    patch.finishedAssetId = next.finishedArtwork?.assetId ?? null;
  return patch;
}

/** The home's own listing, in a new tab. */
function HomeLink({ url }: { url: string | undefined }) {
  const href = safeHomeUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open the listing"
      title="Open the listing"
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

/** The listing's amenities, the first dozen and the rest on request. */
function Amenities({ list }: { list: readonly string[] }) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 12);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">Amenities</dt>
      <dd className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((amenity) => (
          <span
            key={amenity}
            className="rounded-full border px-2 py-0.5 text-xs"
          >
            {amenity}
          </span>
        ))}
        {list.length > 12 && (
          <button
            type="button"
            onClick={() => setAll((open) => !open)}
            className="text-xs font-medium underline-offset-4 hover:underline"
          >
            {all ? "Show fewer" : `Show all ${list.length}`}
          </button>
        )}
      </dd>
    </div>
  );
}
