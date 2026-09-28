"use client";
import { catalogAddressIssues } from "@/lib/catalog-addresses";
import { useEffect, useRef, useState } from "react";
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
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { COMPOSITION_FORMATS, COMPOSITION_TEMPLATES } from "@/lib/compositions";
import {
  CATALOG_WRITE_PASSES,
  catalogArtworkIssues,
  catalogCardFingerprint,
  catalogCardPreviewUrl,
  catalogUnapproved,
  type CatalogCard,
  type CatalogHome,
} from "@/lib/catalog-studio";
import { safeHomeUrl } from "@/lib/ad-preview-links";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc, type RouterInputs } from "@/orpc/client";
import { ReviewInChatButton } from "../ReviewInChatButton";
import { CatalogPreview } from "./CatalogPreview";
import { CatalogTemplateCard } from "../CatalogTemplateCard";

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
/** A local dev server may change approved cards and export unapproved ones. */
const DEV = process.env.NODE_ENV === "development";
const FORCE = DEV ? { force: true } : {};
/** Approved cards are signed off; they change only after Reopen. */
const locked = (card: CatalogCard) => Boolean(card.approved) && !DEV;
const LOCKED_TITLE = "Approved. Reopen it to change it.";
const PORTRAIT = COMPOSITION_FORMATS.find((f) => f.id === "portrait")!;
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
  const [view, setView] = useState<"studio" | "preview" | "exports">("studio");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [details, setDetails] = useState<CatalogCard | null>(null);
  const [library, setLibrary] = useState(false);
  /** A card whose photo is being swapped straight from its row, saved on pick. */
  const [picking, setPicking] = useState<CatalogCard | null>(null);
  const [limit, setLimit] = useState(10);
  const [reviewOnly, setReviewOnly] = useState(false);
  /** Cards with a New copy or New photo call in flight. */
  const [fixing, setFixing] = useState<Record<string, "copy" | "photo">>({});
  const [busy, setBusy] = useState(false);
  /** The catalog card accordion. */
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const draft = query.data?.draft;
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
  const visible = reviewOnly ? unapproved : (draft?.cards ?? []);
  async function exportCatalog() {
    setBusy(true);
    const done = await act(
      () => orpc.catalog.exportCatalog.call({ brandId, ...FORCE }),
      "Unable to export",
    );
    if (done) setView("exports");
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
              <ReviewInChatButton
                brandId={brandId}
                brandName={brandName}
                surface="catalog"
              />
              {CATALOG_WRITE_PASSES.map((pass) => (
                <Button
                  key={pass}
                  variant="outline"
                  disabled={busy || Boolean(writing) || open.length === 0}
                  onClick={() => startWrite.mutate({ brandId, pass })}
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  {writing?.pass === pass
                    ? `${pass === "copy" ? "Rewriting" : "Fixing"} ${writing.done}/${writing.total}`
                    : `${pass === "copy" ? "Rewrite copy" : "Fix photos + copy"} ${open.length}`}
                </Button>
              ))}
              <Button
                variant="outline"
                disabled={busy || unapproved.length === 0}
                onClick={() => approve(unapproved, true)}
              >
                <Check aria-hidden="true" className="size-4" />
                Approve all
              </Button>
              <Button
                disabled={
                  busy ||
                  activeExport ||
                  !draft.cards.some((c) => c.included) ||
                  catalogArtworkIssues(draft).length > 0 ||
                  (unapproved.length > 0 && !DEV)
                }
                title={
                  unapproved.length > 0
                    ? `${unapproved.length} included card${unapproved.length === 1 ? "" : "s"} not approved yet`
                    : undefined
                }
                onClick={() => void exportCatalog()}
              >
                {busy
                  ? "Working…"
                  : unapproved.length > 0 && DEV
                    ? "Create export (dev, unapproved)"
                    : "Create export"}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border">
            <button
              type="button"
              aria-expanded={picker}
              onClick={() => setPicker((o) => !o)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm"
            >
              <span>
                <span className="font-medium">Catalog card</span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {COMPOSITION_TEMPLATES.find(
                    (t) => t.id === query.data?.defaultTemplate,
                  )?.label.replace(/^Catalog · /, "") ?? "place"}
                </span>
              </span>
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
              {([false, true] as const).map((only) => (
                <Button
                  key={String(only)}
                  variant={reviewOnly === only ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={reviewOnly === only}
                  onClick={() => setReviewOnly(only)}
                >
                  {only ? `Needs review ${unapproved.length}` : "All"}
                </Button>
              ))}
            </div>
            <div className="flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void act(
                    () =>
                      orpc.catalog.setIncluded.call({
                        brandId,
                        included: true,
                      }),
                    "Unable to update the catalog",
                  )
                }
              >
                Include all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void act(
                    () =>
                      orpc.catalog.setIncluded.call({
                        brandId,
                        included: false,
                      }),
                    "Unable to update the catalog",
                  )
                }
              >
                Exclude all
              </Button>
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
                  className={`overflow-hidden rounded-xl border bg-card ${card.included ? "" : "opacity-50"}`}
                >
                  <button
                    className="block w-full"
                    disabled={locked(card)}
                    title={locked(card) ? LOCKED_TITLE : undefined}
                    onClick={() => setDetails({ ...card })}
                    aria-label={`Edit ${homeOf(card)?.name}`}
                  >
                    <CardPreview brandId={brandId} card={card} />
                  </button>
                  {card.mode === "finished" && (
                    <p className="px-3 pt-2 text-xs text-muted-foreground">
                      Finished artwork
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
                    aria-label={homeOf(card)?.name}
                    className={`rounded-lg border p-4 ${card.included || editing ? "" : "opacity-50"}`}
                  >
                    <div className="grid grid-cols-1 items-start gap-5 @xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                      <div className="mx-auto w-full max-w-xs overflow-hidden rounded-lg">
                        <CardPreview brandId={brandId} card={shown} />
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {homeOf(card)?.name}
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
                            Finished artwork, with no added text or logo.
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
          exports={query.data?.exports ?? []}
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
                      ? `${item.rows?.length} homes · ${item.assets?.length} images`
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
              <div className="flex gap-3 overflow-x-auto">
                {item.assets?.map((a) => (
                  <a
                    key={a.assetId}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-32 shrink-0"
                  >
                    <img
                      src={a.url}
                      alt={`${a.name} · ${a.format}`}
                      loading="lazy"
                      className="h-40 w-32 rounded bg-muted object-contain"
                    />
                    <p className="mt-1 text-xs">
                      {a.name} · {a.format}
                    </p>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
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
              <CardPreview brandId={brandId} card={details} />
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
                      format: "portrait",
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
}: {
  brandId: string;
  card: CatalogCard;
}) {
  const src =
    card.mode === "finished" || card.title.trim()
      ? preview(brandId, card)
      : undefined;
  const empty =
    card.mode === "finished" ? "Choose finished artwork" : "Add a headline";
  return (
    <PreviewImage key={src ?? empty} src={src} alt={card.title} empty={empty} />
  );
}

function PreviewImage({
  src,
  alt,
  empty,
}: {
  src: string | undefined;
  alt: string;
  empty: string;
}) {
  const [failed, setFailed] = useState(false);
  const aspectRatio = `${PORTRAIT.width}/${PORTRAIT.height}`;
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
          <option value="compose">Compose</option>
          <option value="finished">Finished artwork</option>
        </select>
      </label>
      {card.mode === "finished" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use the original image as-is. Text and branding are already part of
            the image. Your composition is kept if you switch back.
          </p>
          <Button variant="outline" onClick={onLibrary}>
            Choose finished artwork
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
              {["top", "center", "bottom"].map((p) => (
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
