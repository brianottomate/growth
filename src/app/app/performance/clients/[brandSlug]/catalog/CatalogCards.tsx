"use client";

import { ReviewDiscussion } from "@/components/review/ReviewDiscussion";
import { CopyButton } from "@/components/copy-button";
import { toast } from "@/components/ui/toast";
import { ImagePickerDialog } from "@/components/image-picker-dialog";
import { CompositionSelector } from "@/components/composition-picker";
import {
  ReviewPreview,
  useReviewPreview,
  usePreviewReviewStatus,
} from "@/components/review/ReviewPreview";
import { ApprovedStamp } from "@/components/approved-stamp";
import { catalogAddressIssues } from "@/lib/catalog-addresses";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Check,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  Sparkles,
  Layers,
  Download,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/empty-state";
import { ShapeBrandButton } from "../ShapeBrandButton";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  previewAtWidth,
} from "@/lib/compositions";
import {
  catalogArtworkIssues,
  catalogCardReviewKey,
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  DeleteAlert,
} from "@/components/ui/alert-dialog";
import { orpc, type RouterInputs } from "@/orpc/client";
import { reviewInChat } from "../ReviewInChatButton";
import { CatalogAdCopyCard } from "./CatalogAdCopy";
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
  status === "queued" || status === "running";
/**
 * Local export tooling may export unapproved cards with
 * `scripts/export-catalog-unapproved.ts`.
 */
const DEV = process.env.NODE_ENV === "development";
const FORCE = DEV ? { force: true } : {};
/** Approved cards are signed off; they change only after Reopen. */
const locked = (card: CatalogCard) => Boolean(card.approved);
const LOCKED_TITLE = "Approved. Reopen it to change it.";
const preview = catalogCardPreviewUrl;
export function CatalogCards({
  brandId,
  brandName = "",
}: {
  brandId: string;
  brandName?: string;
  /** The brand's hero home, drawn in the card picker. */
}) {
  const reviewPreview = useReviewPreview();
  const previewStatus = usePreviewReviewStatus();
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
  const writeQuery = useQuery({
    ...writeStatus,
    refetchInterval: (q) => (running(q.state.data?.run?.status) ? 2500 : false),
  });
  const writeRun = writeQuery.data?.run;
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["studio", "preview", "exports"]).withDefault(
      "studio",
    ),
  );
  /** A home to scroll to in Studio, set by the links on an export's images. */
  const [focusHome, setFocusHome] = useQueryState("home", parseAsString);
  const [search, setSearch] = useState("");
  const [inclusion, setInclusion] = useQueryState(
    "inclusion",
    parseAsStringLiteral(["included", "excluded", "all"]).withDefault(
      "included",
    ),
  );
  const [details, setDetails] = useState<CatalogCard | null>(null);
  const [pendingEditorAction, setPendingEditorAction] = useState<
    (() => void) | null
  >(null);
  const [saving, setSaving] = useState(false);
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
    parseAsStringLiteral([
      "all",
      "review",
      "draft",
      "ready",
      "approved",
    ]).withDefault("all"),
  );
  /** Cards with a New copy or New photo call in flight. */
  const [fixing, setFixing] = useState<Record<string, "copy" | "photo">>({});
  const [busy, setBusy] = useState(false);
  /** The catalog card accordion. */
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  /** Cards approved this session, so their stamp lands rather than sits. */
  const [stamped, setStamped] = useState<Set<string>>(new Set());
  const draft = query.data?.draft;
  const leaveEditor = (action: () => void) => {
    if (saving) return;
    const original = draft?.cards.find(
      (card) => card.homeId === details?.homeId,
    );
    if (
      details &&
      original &&
      Object.keys(cardPatch(original, details)).length
    ) {
      setPendingEditorAction(() => action);
    } else action();
  };
  const openEditor = (card: CatalogCard) =>
    leaveEditor(() => setDetails({ ...card }));
  const format = query.data?.format ?? DEFAULT_CATALOG_FORMAT;
  const homes = query.data?.homes ?? [];
  const homeOf = (card: CatalogCard) => homes.find((h) => h.id === card.homeId);
  const reload = () => client.invalidateQueries({ queryKey: state.queryKey });
  const importHomes = useMutation(
    orpc.catalog.refreshHomes.mutationOptions({
      onSuccess: reload,
      onError: (e) => setError(errorMessage(e, "Could not import homes")),
    }),
  );
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
            : `Let's shape ${homeName}'s catalog card. Read the current card and home evidence, then discuss options before changing anything.`,
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
  const update = async (next: CatalogCard) => {
    const prev = draft?.cards.find((c) => c.homeId === next.homeId);
    if (!prev) return false;
    const patch = cardPatch(prev, next);
    if (Object.keys(patch).length)
      return (
        (await act(
          () =>
            orpc.catalog.editCard.call({
              brandId,
              homeId: next.homeId,
              ...patch,
              ...FORCE,
            }),
          "Unable to save the card",
        )) !== null
      );
    return true;
  };
  /**
   * Sign cards off as shown, or take it back; the server refuses stale ones.
   * The cards flip at once and flip back if the server says no.
   */
  const approve = (cards: CatalogCard[], approved: boolean) => {
    const ids = new Set(cards.map((card) => card.homeId));
    const previous = client.getQueryData(state.queryKey);
    client.setQueryData(state.queryKey, (data) =>
      data?.draft
        ? {
            ...data,
            draft: {
              ...data.draft,
              cards: data.draft.cards.map((card) =>
                ids.has(card.homeId)
                  ? {
                      ...card,
                      approved,
                      ...(!approved ? { ready: false } : {}),
                    }
                  : card,
              ),
            },
          }
        : data,
    );
    setStamped(approved ? ids : new Set());
    void act(
      () =>
        orpc.catalog.setApproval.call({
          brandId,
          approved,
          cards: cards.map((card) => ({
            homeId: card.homeId,
          })),
        }),
      "Unable to update approval",
    ).then((result) => {
      if (result === null) {
        client.setQueryData(state.queryKey, previous);
        setStamped(new Set());
      }
    });
  };
  // Every card still open for changes: included, not signed off, drawn by
  // us rather than supplied as finished artwork.
  const open = (draft?.cards ?? [])
    .filter((c) => c.included && !c.approved && c.mode !== "finished")
    .map((c) => c.homeId);
  const startWrite = useMutation(
    orpc.catalog.writeCards.mutationOptions({
      onMutate: () => setError(""),
      onSuccess: ({ run }) => {
        client.setQueryData(writeStatus.queryKey, { run });
        void client.invalidateQueries({ queryKey: orpc.workflow.key() });
      },
      onError: (e) => setError(errorMessage(e, "Unable to write the cards")),
    }),
  );
  const writeAdCopy = useMutation(
    orpc.catalog.writeAdCopy.mutationOptions({
      onMutate: () => setError(""),
      onSuccess: () => void reload(),
      onError: (e) => setError(errorMessage(e, "Unable to write the ad copy")),
    }),
  );
  const writing = running(writeRun?.status)
    ? writeRun
    : startWrite.isPending
      ? { pass: startWrite.variables?.pass, done: 0, total: open.length }
      : null;
  const unapproved = draft ? catalogUnapproved(draft) : [];
  const inclusionCards = (draft?.cards ?? []).filter(
    (card) =>
      inclusion === "all" ||
      (inclusion === "included" ? card.included : !card.included),
  );
  const statusOf = (card: CatalogCard) =>
    reviewPreview
      ? previewStatus(homeOf(card)?.name ?? card.title)
      : card.approved
        ? "approved"
        : card.ready
          ? "ready"
          : "draft";
  const draftCount = inclusionCards.filter(
    (card) => statusOf(card) === "draft",
  ).length;
  const readyCount = inclusionCards.filter(
    (card) => statusOf(card) === "ready",
  ).length;
  const approvalCount = inclusionCards.filter((card) =>
    reviewPreview ? statusOf(card) === "approved" : card.approved,
  ).length;
  const filtered = inclusionCards.filter(
    (card) =>
      filter === "all" ||
      (reviewPreview
        ? filter === "review"
          ? statusOf(card) !== "approved"
          : statusOf(card) === filter
        : filter === "review" || filter === "draft"
          ? !card.approved && (filter === "review" || !card.ready)
          : statusOf(card) === filter),
  );
  const visible = filtered.filter((card) =>
    `${homeOf(card)?.name ?? ""} ${card.title}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  useEffect(() => {
    if (view !== "studio" || !focusHome || !draft) return;
    const index = visible.findIndex((card) => card.homeId === focusHome);
    if (index < 0) {
      if (filter !== "all") void setFilter("all");
      if (
        draft.cards.some(
          (card) =>
            card.homeId === focusHome &&
            inclusion !== "all" &&
            (inclusion === "included" ? !card.included : card.included),
        )
      )
        void setInclusion("all");
      return;
    }
    if (index >= limit) {
      setLimit(index + 1);
      return;
    }
    document
      .getElementById(`home-${focusHome}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [
    view,
    focusHome,
    draft,
    visible,
    filter,
    limit,
    setFilter,
    inclusion,
    setInclusion,
  ]);
  async function exportCatalog() {
    setBusy(true);
    const done = await act(
      () => orpc.catalog.exportCatalog.call({ brandId, fresh }),
      "Unable to export",
    );
    if (done) {
      void setView("exports");
      void client.invalidateQueries({ queryKey: orpc.workflow.key() });
    }
    setBusy(false);
  }
  const cardActions = () => (
    <>
      <Button size="sm" variant="outline" onClick={() => setPicker(true)}>
        Choose template
      </Button>
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="catalog cards, copy and templates"
      />
    </>
  );
  const activity = useQuery({
    ...orpc.workflow.activity.queryOptions({ input: { brandId } }),
  });
  const activeExport = activity.data?.some(
    (run) => run.destination === "Catalog" && running(run.status),
  );
  const exportActions = draft ? (
    <>
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
        loading={busy || activeExport}
        onClick={() => void exportCatalog()}
      >
        {busy || activeExport ? "Creating export…" : "Create export"}
      </Button>
    </>
  ) : undefined;
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Catalog view"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5"
      >
        {(["studio", "preview", "exports"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={view === value ? "secondary" : "ghost"}
            aria-pressed={view === value}
            onClick={() =>
              leaveEditor(() => {
                setDetails(null);
                void setView(value);
              })
            }
          >
            {value === "studio"
              ? "Cards"
              : value === "preview"
                ? "Preview"
                : "Exports"}
          </Button>
        ))}
      </div>
      {view === "studio" && draft && (
        <CatalogAdCopyCard
          brandId={brandId}
          brandName={brandName}
          ad={draft.ad}
        />
      )}
      {view !== "exports" && (
        <WorkspaceCard
          title={view === "preview" ? "Catalog preview" : "Catalog cards"}
          icon={Layers}
          count={draft?.cards.length ?? 0}
          actions={view === "studio" ? cardActions() : undefined}
        >
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
          {view !== "preview" && draft && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {draft.cards.filter((c) => c.included).length} of{" "}
                  {draft.cards.length} homes included ·{" "}
                  {
                    draft.cards.filter(
                      (c) =>
                        c.included &&
                        (reviewPreview
                          ? statusOf(c) === "approved"
                          : c.approved),
                    ).length
                  }{" "}
                  approved
                </span>
                <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Bulk actions
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DropdownMenuItem
                        onSelect={() =>
                          reviewInChat({
                            brandId,
                            brandName,
                            surface: "catalog",
                          })
                        }
                      >
                        <MessageSquare aria-hidden="true" />
                        Review in chat
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={
                          busy ||
                          Boolean(writing) ||
                          startWrite.isPending ||
                          open.length === 0
                        }
                        onSelect={() =>
                          startWrite.mutate({ brandId, pass: "photosAndCopy" })
                        }
                      >
                        <Sparkles aria-hidden="true" />
                        Select photos + write copy
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          busy ||
                          Boolean(writing) ||
                          startWrite.isPending ||
                          open.length === 0
                        }
                        onSelect={() =>
                          startWrite.mutate({ brandId, pass: "copy" })
                        }
                      >
                        <Sparkles aria-hidden="true" />
                        Write copy only
                      </DropdownMenuItem>
                      {([false, true] as const).map((headlineOnly) => (
                        <DropdownMenuItem
                          key={String(headlineOnly)}
                          disabled={writeAdCopy.isPending}
                          onSelect={() =>
                            writeAdCopy.mutate({ brandId, headlineOnly })
                          }
                        >
                          <Sparkles aria-hidden="true" />
                          {writeAdCopy.isPending
                            ? "Writing ad copy…"
                            : headlineOnly
                              ? "Write ad headlines only"
                              : "Write ad headlines + descriptions"}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={importHomes.isPending}
                        onSelect={() => importHomes.mutate({ brandId })}
                      >
                        {importHomes.isPending
                          ? "Refreshing homes…"
                          : "Refresh homes"}
                      </DropdownMenuItem>
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
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <InputGroup>
                  <InputGroupAddon>
                    <Search className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search catalog homes"
                    placeholder="Search homes"
                    disabled={Boolean(details)}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </InputGroup>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    role="group"
                    aria-label="Review status"
                    className="flex flex-wrap rounded-lg border p-0.5"
                  >
                    {(reviewPreview
                      ? (["all", "draft", "ready", "approved"] as const)
                      : (["all", "draft", "ready", "approved"] as const)
                    ).map((key) => (
                      <Button
                        key={key}
                        variant={filter === key ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={filter === key}
                        onClick={() => {
                          leaveEditor(() => {
                            setDetails(null);
                            void setFilter(key);
                            setLimit(10);
                          });
                        }}
                      >
                        {key === "draft"
                          ? `Draft ${draftCount}`
                          : key === "ready"
                            ? `Ready ${readyCount}`
                            : key === "approved"
                              ? `Approved ${approvalCount}`
                              : `All ${inclusionCards.length}`}
                      </Button>
                    ))}
                  </div>
                  <Select
                    value={inclusion}
                    onValueChange={(value) => {
                      if (
                        value === "included" ||
                        value === "excluded" ||
                        value === "all"
                      ) {
                        leaveEditor(() => {
                          setDetails(null);
                          void setInclusion(value);
                          setLimit(10);
                        });
                      }
                    }}
                  >
                    <SelectTrigger size="sm" aria-label="Catalog inclusion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="included">Included</SelectItem>
                      <SelectItem value="excluded">Excluded only</SelectItem>
                      <SelectItem value="all">All homes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {visible.length === 0 && draft.cards.length > 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No catalog cards match these filters.
                </p>
              )}
              {catalogArtworkIssues(draft).length > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {catalogArtworkIssues(draft).join(" · ")}
                </p>
              )}
              {!draft.cards.length && (
                <EmptyState
                  icon={Layers}
                  title="Import homes to start your catalog"
                  description="Import the client’s WanderOS homes when you’re ready to build catalog cards. Then choose a template and write their copy."
                  actions={
                    <Button
                      loading={importHomes.isPending}
                      onClick={() => importHomes.mutate({ brandId })}
                    >
                      {importHomes.isPending
                        ? "Importing homes…"
                        : "Import homes"}
                    </Button>
                  }
                />
              )}
              <div className="space-y-3">
                {visible.slice(0, limit).map((card) => {
                  const editing = details?.homeId === card.homeId;
                  const shown = editing ? details : card;
                  return (
                    <CatalogCardLayout
                      key={card.homeId}
                      id={`home-${card.homeId}`}
                      name={homeOf(card)?.name}
                      dimmed={
                        !card.included && !editing && inclusion !== "excluded"
                      }
                      highlighted={focusHome === card.homeId}
                      approved={card.approved && !reviewPreview}
                      fresh={stamped.has(card.homeId)}
                      review={
                        reviewPreview ? (
                          <ReviewPreview
                            reviewKey={homeOf(card)?.name ?? card.title}
                            variant="reopen"
                            initialStatus={statusOf(card)}
                          />
                        ) : (
                          <ReviewDiscussion
                            target={{
                              type: "catalog",
                              id: card.homeId,
                              brandId,
                            }}
                          />
                        )
                      }
                      artwork={
                        <CardPreview
                          brandId={brandId}
                          card={shown}
                          format={format}
                        />
                      }
                    >
                      <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          {!card.included && (
                            <Badge variant="outline">Excluded</Badge>
                          )}
                          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                            <span
                              className="truncate"
                              title={homeOf(card)?.name}
                            >
                              {homeOf(card)?.name}
                            </span>
                            <HomeLink url={homeOf(card)?.url} />
                          </p>
                          {!editing && (
                            <div className="ml-auto flex shrink-0 flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => workInChat(card)}
                              >
                                <MessageSquare className="size-3.5" />
                                Shape
                              </Button>
                            </div>
                          )}
                        </div>
                        {editing ? (
                          <CardEditor
                            brandId={brandId}
                            card={details}
                            home={homeOf(card)}
                            onChange={setDetails}
                            onHero={(photoUrl) =>
                              void setHero(details, photoUrl)
                            }
                            onLibrary={() => setLibrary(true)}
                            onApply={async () => {
                              setSaving(true);
                              const saved = await update({
                                ...details,
                                included: card.included,
                              });
                              setSaving(false);
                              if (saved) setDetails(null);
                            }}
                            saving={saving}
                            onCancel={() => leaveEditor(() => setDetails(null))}
                          />
                        ) : card.mode === "finished" ? (
                          <p className="text-sm text-muted-foreground">
                            Artwork used as-is, with no added text or logo.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <h5 className="text-xs font-medium text-muted-foreground">
                                Text on image
                              </h5>
                              <p className="text-lg leading-snug font-medium break-words">
                                {card.title || "No headline yet"}
                              </p>
                              {card.subtitle && (
                                <p className="text-sm text-muted-foreground">
                                  {card.subtitle}
                                </p>
                              )}
                            </div>
                            <Amenities
                              list={homeOf(card)?.amenities ?? []}
                              headline={card.title}
                            />
                          </div>
                        )}
                        {!editing && (
                          <div className="space-y-1.5 border-t pt-3 text-sm">
                            <h5 className="text-xs font-medium text-muted-foreground">
                              Ad copy
                            </h5>
                            <div className="space-y-0.5">
                              <p className="font-medium">{card.adHeadline}</p>
                              {card.adDescription && (
                                <p className="text-muted-foreground">
                                  {card.adDescription}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {card.aiReview?.fingerprint ===
                          catalogCardReviewKey(card) &&
                          card.aiReview.findings.length > 0 && (
                            <details className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                              <summary className="cursor-pointer font-medium">
                                Review notes · {card.aiReview.findings.length}
                              </summary>
                              {card.aiReview.findings.map((finding, i) => (
                                <p key={i} className="text-muted-foreground">
                                  <span className="font-medium">
                                    {finding.action === "check_image"
                                      ? "Check image"
                                      : finding.action === "consider_excluding"
                                        ? "Consider excluding"
                                        : "Check details"}
                                    :
                                  </span>{" "}
                                  {finding.reason}
                                </p>
                              ))}
                            </details>
                          )}
                        {!editing && (
                          <div className="mt-auto space-y-3 border-t pt-3">
                            <div
                              role="group"
                              aria-label="Quick actions"
                              className="flex flex-wrap items-center justify-start gap-1"
                            >
                              {(
                                [
                                  ["Choose photo", () => choosePhoto(card)],
                                  [
                                    fixing[card.homeId] === "photo"
                                      ? "Updating photo + copy…"
                                      : "New photo + copy",
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
                                    Boolean(fixing[card.homeId]) ||
                                    locked(card) ||
                                    (card.mode === "finished" &&
                                      label !== "Choose photo")
                                  }
                                  title={
                                    locked(card) ? LOCKED_TITLE : undefined
                                  }
                                  onClick={onClick}
                                >
                                  {label}
                                </Button>
                              ))}
                            </div>
                            {!reviewPreview && (
                              <div
                                role="group"
                                aria-label="Card actions"
                                className="flex flex-wrap items-center justify-end gap-2"
                              >
                                <IncludeButton
                                  card={card}
                                  onInclude={(included) =>
                                    update({ ...card, included })
                                  }
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={
                                    locked(card) ||
                                    Boolean(fixing[card.homeId]) ||
                                    saving
                                  }
                                  title={
                                    locked(card) ? LOCKED_TITLE : undefined
                                  }
                                  onClick={() => openEditor(card)}
                                >
                                  Edit
                                </Button>
                                {!card.approved && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() =>
                                      void act(
                                        () =>
                                          orpc.catalog.setReady.call({
                                            brandId,
                                            homeIds: [card.homeId],
                                            ready: !card.ready,
                                          }),
                                        "Unable to update Ready",
                                      )
                                    }
                                  >
                                    {card.ready
                                      ? "Back to draft"
                                      : "Mark ready"}
                                  </Button>
                                )}
                                <ApproveButton
                                  card={card}
                                  showStatus={false}
                                  disabled={
                                    Boolean(fixing[card.homeId]) || saving
                                  }
                                  onApprove={(approved) =>
                                    approve([card], approved)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CatalogCardLayout>
                  );
                })}
              </div>
              {limit < visible.length && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setLimit(limit + 10)}
                  >
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
        </WorkspaceCard>
      )}
      {view === "exports" && (
        <WorkspaceCard
          id="catalog-exports"
          title="Exports"
          icon={Download}
          count={query.data?.exports.length ?? 0}
          actions={exportActions}
        >
          <div className="space-y-4">
            {!query.data?.exports.length && (
              <EmptyState
                compact
                icon={Download}
                title="No exports yet"
                description="Approve the included catalog cards, then create an export. Each export preserves the approved cards and home facts at that moment."
                actions={
                  <>
                    {" "}
                    {exportActions}{" "}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void setView("studio")}
                    >
                      Review catalog cards
                    </Button>{" "}
                  </>
                }
              />
            )}
            {query.data?.exports.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-xl border p-4"
              >
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
                {item.ad && (
                  <dl className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 text-sm @xl:grid-cols-[8rem_minmax(0,1fr)_auto]">
                    {([["Primary text", item.ad.primaryText]] as const)
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="contents [&>*]:min-w-0">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                            {value}
                          </dd>
                          <dd>
                            <CopyButton text={value} size="sm" />
                          </dd>
                        </div>
                      ))}
                  </dl>
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
        </WorkspaceCard>
      )}
      <AlertDialog
        open={pendingEditorAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEditorAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your card edits have not been saved. Discard them to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pendingEditorAction?.();
                setPendingEditorAction(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a catalog template</DialogTitle>
            <DialogDescription>
              Choose the shared card layout.
            </DialogDescription>
          </DialogHeader>
          <CatalogTemplateCard brandId={brandId} />
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
    </div>
  );
}

/** Put a home in the export or take it out. */
export function IncludeButton({
  card,
  onInclude,
}: {
  card: CatalogCard;
  onInclude: (included: boolean) => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={card.included ? "Exclude from catalog" : "Include in catalog"}
      title={card.included ? "Exclude from catalog" : "Include in catalog"}
      onClick={() => onInclude(!card.included)}
    >
      {card.included ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
    </Button>
  );
}

/** Sign one card off as it stands, or take the sign-off back. */
export function ApproveButton({
  card,
  onApprove,
  disabled = false,
  showStatus = true,
}: {
  card: CatalogCard;
  onApprove: (approved: boolean) => void;
  disabled?: boolean;
  showStatus?: boolean;
}) {
  return card.approved ? (
    <div className="flex items-center gap-2">
      {showStatus && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check aria-hidden="true" className="size-3.5" /> Approved
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onApprove(false)}
      >
        Reopen
      </Button>
    </div>
  ) : (
    <Button size="sm" disabled={disabled} onClick={() => onApprove(true)}>
      Approve
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
      ? previewAtWidth(preview(brandId, card, format), 400)
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

export function CardEditor({
  brandId,
  card,
  home,
  onChange,
  onHero,
  onLibrary,
  onApply,
  onCancel,
  saving = false,
}: {
  brandId?: string;
  card: CatalogCard;
  home: CatalogHome | undefined;
  onChange: (card: CatalogCard) => void;
  /** Make a photo the home's hero, which every surface draws on. */
  onHero: (photoUrl: string) => void;
  onLibrary: () => void;
  onApply: () => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const importPhoto = useMutation(orpc.media.importUrls.mutationOptions());
  const chooseCardPhoto = async (photo: { url: string; assetId?: string }) => {
    try {
      const asset =
        brandId && !photo.assetId
          ? (
              await importPhoto.mutateAsync({
                brandId,
                images: [{ url: photo.url, title: home?.name }],
              })
            ).assets[0]
          : undefined;
      const assetId = photo.assetId ?? asset?.id;
      const url = asset?.url ?? photo.url;
      onChange(
        card.mode === "finished" && assetId
          ? {
              ...card,
              finishedArtwork: { assetId, url, format: DEFAULT_CATALOG_FORMAT },
            }
          : { ...card, imageUrl: url, assetId },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to choose image",
      );
    }
  };

  return (
    <fieldset disabled={saving || importPhoto.isPending} className="space-y-4">
      <div className="space-y-4">
        <div role="group" aria-label="Image mode" className="flex gap-2">
          {(
            [
              ["finished", "Artwork"],
              ["compose", "Composed"],
            ] as const
          ).map(([mode, label]) => (
            <Button
              key={mode}
              size="sm"
              variant={
                (card.mode ?? "compose") === mode ? "secondary" : "outline"
              }
              aria-pressed={(card.mode ?? "compose") === mode}
              onClick={() => onChange({ ...card, mode })}
            >
              {label}
            </Button>
          ))}
        </div>
        {card.mode !== "finished" && (
          <CompositionSelector
            value={card.templateId}
            disabled={saving}
            onChange={(templateId) => onChange({ ...card, templateId })}
            options={COMPOSITION_TEMPLATES.filter(
              (template) => template.id !== "tier-badge",
            ).map((template) => ({
              id: template.id,
              label: template.label,
              previewUrl: brandId
                ? catalogCardPreviewUrl(brandId, {
                    ...card,
                    templateId: template.id,
                  })
                : undefined,
            }))}
          />
        )}
        {card.mode !== "finished" && (
          <div className="flex flex-wrap items-center gap-4">
            <Select
              value={card.imagePosition}
              onValueChange={(value) =>
                onChange({
                  ...card,
                  imagePosition: value as CatalogCard["imagePosition"],
                })
              }
            >
              <SelectTrigger aria-label="Image crop focus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPOSITION_IMAGE_POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    Crop focus: {position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                aria-label="Brand logo"
                checked={card.showLogo}
                onCheckedChange={(showLogo) => onChange({ ...card, showLogo })}
              />
              Brand logo
            </label>
          </div>
        )}
      </div>
      {card.mode === "finished" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use the original image as-is. Text and branding are already part of
            the image. Your composition is kept if you switch back.
          </p>
        </div>
      ) : (
        <div className="space-y-2 border-t pt-3">
          <h5 className="text-sm font-medium">Text on image</h5>
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
        </div>
      )}
      <div className="space-y-2 border-t pt-3">
        <h5 className="text-sm font-medium">Ad copy</h5>
        <label className="block space-y-1 text-sm">
          Ad headline
          <Input
            value={card.adHeadline}
            maxLength={255}
            onChange={(e) => onChange({ ...card, adHeadline: e.target.value })}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Ad description
          <Input
            value={card.adDescription}
            maxLength={255}
            onChange={(e) =>
              onChange({ ...card, adDescription: e.target.value })
            }
          />
        </label>
      </div>
      <div className="space-y-2 border-t pt-3">
        <h5 className="text-sm font-medium">Image</h5>
        <Button variant="outline" onClick={() => setImagePickerOpen(true)}>
          Choose image
        </Button>
      </div>
      <ImagePickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        homes={
          home
            ? [{ id: card.homeId, name: home.name, photos: home.gallery ?? [] }]
            : []
        }
        current={{
          url: card.finishedArtwork?.url ?? card.imageUrl,
          assetId: card.assetId,
        }}
        onPick={(photo) => void chooseCardPhoto(photo)}
        onLibrary={onLibrary}
        onMakeHero={(photo) => onHero(photo.url)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          disabled={
            !card.title.trim() ||
            !card.adHeadline.trim() ||
            (card.mode === "finished" && !card.finishedArtwork)
          }
          loading={saving}
          onClick={onApply}
        >
          Apply changes
        </Button>
      </div>
    </fieldset>
  );
}

/** The row fields a card edit changes; null puts one back on its default. */
function cardPatch(prev: CatalogCard, next: CatalogCard) {
  const patch: Omit<RouterInputs["catalog"]["editCard"], "brandId" | "homeId"> =
    {};
  if (prev.title !== next.title) patch.title = next.title;
  if (prev.subtitle !== next.subtitle) patch.subtitle = next.subtitle;
  if (prev.adHeadline !== next.adHeadline) patch.adHeadline = next.adHeadline;
  if (prev.adDescription !== next.adDescription)
    patch.adDescription = next.adDescription;
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

/** Show three amenities, prioritizing those mentioned in the headline. */
function Amenities({
  list,
  headline,
}: {
  list: readonly string[];
  headline: string;
}) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const copy = headline.toLocaleLowerCase();
  const mentioned = (amenity: string) =>
    copy.includes(amenity.toLocaleLowerCase());
  const ordered = [
    ...list.filter(mentioned),
    ...list.filter((amenity) => !mentioned(amenity)),
  ];
  const shown = all ? ordered : ordered.slice(0, 3);
  return (
    <div
      className="text-sm leading-relaxed text-muted-foreground"
      aria-label="Amenities"
    >
      {shown.join(" · ")}
      {list.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((open) => !open)}
          className="mt-1 block underline underline-offset-4 hover:text-foreground"
        >
          {all ? "Show fewer amenities" : `Show all ${list.length} amenities`}
        </button>
      )}
    </div>
  );
}

/** Shared presentation for live catalog rows and the comparison fixture. */
export function CatalogCardLayout({
  id,
  name,
  dimmed = false,
  highlighted = false,
  approved,
  fresh = false,
  artwork,
  review,
  children,
}: {
  id?: string;
  name?: string;
  dimmed?: boolean;
  highlighted?: boolean;
  approved?: boolean;
  fresh?: boolean;
  artwork: ReactNode;
  review?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={name}
      className={`scroll-mt-20 rounded-lg border p-4 ${dimmed ? "opacity-50" : ""} ${highlighted ? "ring-2 ring-ring" : ""}`}
    >
      <div className="grid grid-cols-1 items-stretch gap-5 @3xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="group/artwork relative mx-auto w-full max-w-sm overflow-hidden rounded-lg">
          {artwork}
          {approved && (
            <ApprovedStamp
              size="lg"
              fresh={fresh}
              className="pointer-events-none absolute top-3 right-3 z-10 bg-card/85 text-[var(--color-success)] backdrop-blur-sm transition-opacity group-focus-within/artwork:opacity-0 group-hover/artwork:opacity-0 pointer-coarse:opacity-90"
            />
          )}
        </div>
        {children}
      </div>
      {review && <div className="mt-4 border-t pt-4">{review}</div>}
    </section>
  );
}
