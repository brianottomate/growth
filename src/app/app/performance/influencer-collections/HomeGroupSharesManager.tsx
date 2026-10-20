"use client";

import { PartnershipsPanel } from "./PartnershipsPanel";
import { CatalogFilter } from "./CatalogFilter";
import { AmplifierDialog } from "@/app/app/brands/AmplifierRolodex";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Container } from "@wandercom/design-system-web/ui/container";
import { cn } from "@wandercom/design-system-shared/classes";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ImageIcon,
  Layers,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { orpc, type RouterOutputs } from "@/orpc/client";
import { safeHomeGroupShareUrl } from "@/lib/home-group-shares";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

type Collection = RouterOutputs["homeGroupShares"]["list"][number];
type Home = RouterOutputs["homeGroupShares"]["homes"][number];
type Draft = {
  id?: string;
  title: string;
  homeIds: string[];
  expectedRevision?: number;
  brandId?: string | null;
};

function toDraft(collection: Collection): Draft {
  return {
    id: collection.id,
    title: collection.title,
    homeIds: [...collection.homeIds],
    expectedRevision: collection.revision,
    brandId: collection.brandId,
  };
}

function HomePhoto({ home, className }: { home?: Home; className?: string }) {
  const url = safeHomeGroupShareUrl(home?.heroSourceUrl);
  return (
    <div className={cn("overflow-hidden bg-surface-secondary", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-secondary">
          <ImageIcon className="size-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export function HomeGroupSharesManager({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [contactDialog, setContactDialog] = useState(false);
  const [tab, setTab] = useState("collections");
  const [partnershipCreateOpen, setPartnershipCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<
    RouterOutputs["amplifier"]["list"]["amplifiers"][number] | null
  >(null);
  const contactKey = [
    ...orpc.amplifier.list.queryKey({ input: {} }),
    { orgId },
  ];
  const contacts = useQuery({
    ...orpc.amplifier.list.queryOptions({ input: {}, queryKey: contactKey }),
  });
  // Workspace-scoped caches keep a switch from briefly showing the old org's links.
  const listKey = [...orpc.homeGroupShares.list.queryKey(), { orgId }];
  const homesKey = [...orpc.homeGroupShares.homes.queryKey(), { orgId }];
  const collections = useQuery({
    ...orpc.homeGroupShares.list.queryOptions({ queryKey: listKey }),
  });
  const catalog = useQuery({
    ...orpc.homeGroupShares.homes.queryOptions({ queryKey: homesKey }),
  });
  const groupKey = [...orpc.homeGroupShares.groups.queryKey(), { orgId }];
  const groups = useQuery({
    ...orpc.homeGroupShares.groups.queryOptions({ queryKey: groupKey }),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(
    [],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const clientCatalog = useQuery({
    ...orpc.homeGroupShares.clients.queryOptions({
      queryKey: [...orpc.homeGroupShares.clients.queryKey(), { orgId }],
    }),
  });
  const [catalogPage, setCatalogPage] = useState(1);
  const [discard, setDiscard] = useState(false);
  const [linkAction, setLinkAction] = useState<{
    collection: Collection;
    kind: "revoke" | "renew";
  } | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const homesById = useMemo(
    () => new Map((catalog.data ?? []).map((home) => [home.id, home])),
    [catalog.data],
  );
  const clients = useMemo(
    () => [
      ...new Map(
        (catalog.data ?? []).map((home) => [home.brandId, home.brandName]),
      ).entries(),
    ],
    [catalog.data],
  );
  const destinations = (clientCatalog.data ?? []).flatMap((client) =>
    (client.markets?.markets ?? []).map((market) => ({
      id: JSON.stringify([client.id, market.id]),
      label: `${market.label} · ${client.name}`,
      brandId: client.id,
      towns: market.towns,
    })),
  );
  const matchingDestinations = destinations.filter((destination) =>
    selectedDestinations.includes(destination.id),
  );
  const groupHomes = new Set(
    (groups.data ?? [])
      .filter((group) => selectedGroups.includes(group.id))
      .flatMap((group) => group.homeIds),
  );
  const filteredHomes = (catalog.data ?? []).filter(
    (home) =>
      (!selectedClients.length || selectedClients.includes(home.brandId)) &&
      (!selectedDestinations.length ||
        matchingDestinations.some(
          (destination) =>
            destination.brandId === home.brandId &&
            destination.towns.some(
              (town) =>
                town.trim().toLowerCase() === home.city?.trim().toLowerCase(),
            ),
        )) &&
      (!selectedGroups.length || groupHomes.has(home.id)) &&
      [home.name, home.brandName, home.city, home.state, home.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "collection"; collection: Collection }
    | {
        kind: "amplifier";
        contact: RouterOutputs["amplifier"]["list"]["amplifiers"][number];
      }
    | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeCollection = useMutation(
    orpc.homeGroupShares.remove.mutationOptions({
      onSuccess: async () => {
        setDeleteTarget(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({ queryKey: groupKey }),
        ]);
        toast.success("Collection removed");
      },
      onError: (failure) => setDeleteError(failure.message),
    }),
  );
  const removeAmplifier = useMutation(
    orpc.amplifier.remove.mutationOptions({
      onSuccess: async () => {
        setDeleteTarget(null);
        await queryClient.invalidateQueries({
          queryKey: orpc.amplifier.list.queryKey({ input: {} }),
        });
        await queryClient.invalidateQueries({ queryKey: listKey });
        toast.success("Amplifier deleted");
      },
      onError: (failure) => setDeleteError(failure.message),
    }),
  );
  const save = useMutation(
    orpc.homeGroupShares.save.mutationOptions({
      onMutate: async (input) => {
        setError(null);
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<Collection[]>(listKey);
        if (input.id) {
          queryClient.setQueryData<Collection[]>(listKey, (rows) =>
            rows?.map((row) =>
              row.id === input.id
                ? {
                    ...row,
                    title: input.title.trim(),
                    homeIds: [...input.homeIds],
                  }
                : row,
            ),
          );
        }
        return { previous };
      },
      onError: (failure, _input, context) => {
        if (context?.previous)
          queryClient.setQueryData(listKey, context.previous);
        setError(failure.message);
      },
      onSuccess: (saved) => {
        queryClient.setQueryData<Collection[]>(listKey, (rows) => [
          saved,
          ...(rows ?? []).filter((row) => row.id !== saved.id),
        ]);
        setDraft(null);
        void queryClient.invalidateQueries({ queryKey: groupKey });
        toast.success("Collection saved");
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );

  function linkSaved(saved: Collection) {
    queryClient.setQueryData<Collection[]>(listKey, (rows) =>
      rows?.map((row) => (row.id === saved.id ? saved : row)),
    );
    setLinkAction(null);
    toast.success(
      saved.shareToken
        ? "New link created. The previous link no longer works."
        : "Link revoked. The collection is now private.",
    );
    void queryClient.invalidateQueries({ queryKey: listKey });
  }
  function linkFailed(failure: Error) {
    toast.error(failure.message);
    setLinkAction(null);
    void queryClient.invalidateQueries({ queryKey: listKey });
  }
  const revoke = useMutation(
    orpc.homeGroupShares.revoke.mutationOptions({
      onSuccess: linkSaved,
      onError: linkFailed,
    }),
  );
  const renew = useMutation(
    orpc.homeGroupShares.renew.mutationOptions({
      onSuccess: linkSaved,
      onError: linkFailed,
    }),
  );
  const busy =
    save.isPending ||
    revoke.isPending ||
    renew.isPending ||
    removeCollection.isPending ||
    removeAmplifier.isPending;

  function openEditor(collection?: Collection) {
    const next = collection ? toDraft(collection) : { title: "", homeIds: [] };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setError(null);
    setSearch("");
    setSelectedClients([]);
    setSelectedDestinations([]);
    setSelectedGroups([]);
    setCatalogPage(1);
  }
  function closeEditor() {
    if (save.isPending) return;
    if (dirty) setDiscard(true);
    else setDraft(null);
  }
  function toggleHome(id: string) {
    if (draft?.brandId) return;
    setDraft((current) => {
      if (!current) return current;
      const selected = current.homeIds.includes(id);
      if (!selected && current.homeIds.length >= 1000) return current;
      return {
        ...current,
        homeIds: selected
          ? current.homeIds.filter((value) => value !== id)
          : [...current.homeIds, id],
      };
    });
  }
  function moveHome(index: number, direction: -1 | 1) {
    if (draft?.brandId) return;
    setDraft((current) => {
      if (!current) return current;
      const ids = [...current.homeIds];
      const next = index + direction;
      if (!ids[index] || !ids[next]) return current;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      return { ...current, homeIds: ids };
    });
  }
  async function copyLink(collection: Collection) {
    if (!collection.shareToken) return;
    const url = `${window.location.origin}/home-groups/${collection.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      setCopyFallback(url);
    }
  }
  async function reloadSavedDraft() {
    if (
      !draft?.id ||
      !window.confirm("Discard your local edits and load the saved version?")
    )
      return;
    const id = draft.id;
    const result = await collections.refetch();
    await catalog.refetch();
    const saved = result.data?.find((row) => row.id === id);
    if (saved) openEditor(saved);
    else
      setError(
        "This collection is no longer available. Your draft has been kept; copy its title and selection before closing.",
      );
  }

  return (
    <Container layout="full" className="space-y-7 px-0">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1 space-y-2 break-words">
          <Text variant="body-sm" color="secondary">
            WANDER PERFORMANCE
          </Text>
          <Heading as="h1" variant="display-sm">
            Influencers
          </Heading>
          <Text color="secondary" variant="body-lg-long">
            Share curated homes with creators and manage partnership links.
          </Text>
        </div>
        <div className="flex max-w-[60%] shrink-0 flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setEditingContact(null);
              setContactDialog(true);
            }}
          >
            <Plus className="size-4" /> New amplifier
          </Button>
          {tab === "partnerships" && (
            <Button
              disabled={
                contacts.isPending ||
                clientCatalog.isPending ||
                catalog.isPending
              }
              onClick={() => setPartnershipCreateOpen(true)}
            >
              <Plus className="size-4" /> New partnership
            </Button>
          )}
          {tab === "collections" && (
            <>
              <Button
                onClick={() => openEditor()}
                disabled={busy || !catalog.data}
              >
                <Plus className="size-4" /> Create collection
              </Button>
            </>
          )}
        </div>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Influencer workspace">
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="amplifiers">Amplifiers</TabsTrigger>
          <TabsTrigger value="partnerships">Partnerships</TabsTrigger>
        </TabsList>
        <TabsContent value="collections" className="mt-5 space-y-7">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-secondary p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-secondary" />
            <div className="space-y-1">
              <Text weight="medium">Sharing access</Text>
              <Text color="secondary" variant="body-long">
                Anyone with a collection link can browse the selected homes
                without signing in. Reuse the same link for multiple
                influencers; preferences and dates stay in email. Revoke access
                at any time.
              </Text>
            </div>
          </div>
          {(collections.isPending || catalog.isPending) && (
            <div
              role="status"
              className="flex items-center justify-center gap-3 py-16"
            >
              <Loader2 className="size-5 animate-spin" />
              <Text>Loading collections…</Text>
            </div>
          )}
          {(collections.isError || catalog.isError) && (
            <div
              role="alert"
              className="space-y-4 rounded-xl border border-border p-6"
            >
              <Text>
                We couldn’t load this workspace’s collections and homes.
              </Text>
              <Button
                variant="outline"
                onClick={() => {
                  void collections.refetch();
                  void catalog.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          )}
          {collections.data && catalog.data && !collections.data.length && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <Layers className="mx-auto mb-5 size-10 text-secondary" />
              <Heading as="h2" variant="headline">
                Create a home group to share
              </Heading>
              <Text className="mx-6 mt-3 mb-6" color="secondary">
                Bring homes from different clients into one collection, in the
                order you choose.
              </Text>
              <Button onClick={() => openEditor()}>
                <Plus className="size-4" />
                Create your first collection
              </Button>
            </div>
          )}
          {collections.data && catalog.data && collections.data.length > 0 && (
            <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {collections.data.map((collection) => (
                <article
                  key={collection.id}
                  className="overflow-hidden rounded-xl border border-border bg-surface-primary"
                >
                  <div className="grid h-40 grid-cols-3 gap-1 bg-surface-secondary">
                    {[0, 1, 2].map((position) => (
                      <HomePhoto
                        key={position}
                        home={homesById.get(collection.homeIds[position] ?? "")}
                        className="h-40"
                      />
                    ))}
                  </div>
                  <div className="space-y-5 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Heading
                        as="h2"
                        variant="headline-sm"
                        className="min-w-0 break-words"
                      >
                        {collection.title}
                      </Heading>
                      <Badge variant="secondary">
                        {collection.shareToken ? "Link active" : "Private"}
                      </Badge>
                    </div>
                    <Text color="secondary">
                      {collection.homeIds.length}{" "}
                      {collection.homeIds.length === 1 ? "home" : "homes"} ·{" "}
                      {collection.brandId ? "Brand group" : "Workspace group"}
                    </Text>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditor(collection)}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget({ kind: "collection", collection });
                        }}
                      >
                        <Trash2 className="size-4" />{" "}
                        {collection.brandId
                          ? "Remove share"
                          : "Delete collection"}
                      </Button>
                      {collection.shareToken ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copyLink(collection)}
                            disabled={busy}
                          >
                            <Copy className="size-4" />
                            Copy link
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`/home-groups/${collection.shareToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open preview
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setLinkAction({ collection, kind: "revoke" })
                            }
                            disabled={busy}
                          >
                            <Link2Off className="size-4" />
                            Revoke link
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setLinkAction({ collection, kind: "renew" })
                          }
                          disabled={busy}
                        >
                          <Link2 className="size-4" />
                          Create new link
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="partnerships" className="mt-5">
          <PartnershipsPanel
            orgId={orgId}
            clients={clientCatalog.data ?? []}
            homes={catalog.data ?? []}
            contacts={contacts.data?.amplifiers ?? []}
            createOpen={partnershipCreateOpen}
            onCreateOpenChange={setPartnershipCreateOpen}
          />
        </TabsContent>
        <TabsContent value="amplifiers" className="mt-5 space-y-5">
          <div className="space-y-2">
            <Heading as="h2" variant="headline">
              Amplifiers
            </Heading>
            <Text color="secondary">
              Workspace contacts you can reuse across collections. Adding a
              contact does not create a brand workspace.
            </Text>
          </div>
          {contacts.isPending && <Text role="status">Loading amplifiers…</Text>}
          {contacts.isError && (
            <div role="alert">
              <Text>We couldn’t load amplifiers.</Text>
              <Button variant="outline" onClick={() => void contacts.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {contacts.data && !contacts.data.amplifiers.length && (
            <div className="space-y-4 rounded-xl border border-dashed border-border p-8 text-center">
              <Text>
                No amplifiers yet. Add a contact before choosing homes for them.
              </Text>
              <Button
                onClick={() => {
                  setEditingContact(null);
                  setContactDialog(true);
                }}
              >
                <Plus className="size-4" /> New amplifier
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {contacts.data?.amplifiers.map((contact) => (
              <article
                key={contact.id}
                className="min-w-0 space-y-3 rounded-xl border border-border p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <Heading
                    as="h3"
                    variant="headline-sm"
                    className="break-words"
                  >
                    {contact.name}
                  </Heading>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingContact(contact);
                      setContactDialog(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
                {contact.type && (
                  <Badge variant="secondary">{contact.type}</Badge>
                )}
                {contact.email && (
                  <Text className="break-words" color="secondary">
                    {contact.email}
                  </Text>
                )}
                {contact.phone && (
                  <Text color="secondary">{contact.phone}</Text>
                )}
                <div className="flex flex-wrap gap-2">
                  {contact.handles?.map((handle) => (
                    <Badge
                      key={`${handle.platform}:${handle.handle}`}
                      variant="outline"
                    >
                      {handle.platform} · @{handle.handle}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget({ kind: "amplifier", contact });
                  }}
                >
                  <Trash2 className="size-4" /> Delete amplifier
                </Button>
                {contact.notes && (
                  <Text
                    color="secondary"
                    className="break-words whitespace-pre-wrap"
                  >
                    {contact.notes}
                  </Text>
                )}
              </article>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <AmplifierDialog
        allowBrandLink={false}
        initial={editingContact ?? undefined}
        open={contactDialog}
        onOpenChange={setContactDialog}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: contactKey });
        }}
      />
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          size="2xl"
          className="max-h-svh overflow-y-auto"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit collection" : "Create collection"}
            </DialogTitle>
            <DialogDescription>
              Choose 1–1000 homes. The title and selected homes will be public
              to anyone with the link.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy) save.mutate(draft);
              }}
              className="space-y-5"
            >
              {draft.brandId && (
                <Text color="secondary">
                  This link shares an existing brand group. Manage its homes in
                  the client’s Home groups page; changes there update this link.
                </Text>
              )}
              <fieldset disabled={busy} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="collection-title">Collection title</Label>
                  <Input
                    id="collection-title"
                    placeholder="Coastal escapes for your next story"
                    value={draft.title}
                    maxLength={120}
                    required
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                  <Text color="secondary" variant="body-sm">
                    Visible on the shared page. Do not include private client
                    information.
                  </Text>
                </div>
                <fieldset
                  disabled={busy || Boolean(draft.brandId)}
                  className="grid grid-cols-1 gap-6 lg:grid-cols-3"
                >
                  <section
                    className="space-y-3 lg:col-span-2"
                    aria-label="Home catalog"
                  >
                    <div className="flex flex-wrap gap-2">
                      <div className="min-w-40 flex-1">
                        <InputGroup>
                          <InputGroupAddon>
                            <Search className="size-4" aria-hidden="true" />
                          </InputGroupAddon>
                          <InputGroupInput
                            aria-label="Search homes"
                            value={search}
                            onChange={(event) => {
                              setSearch(event.target.value);
                              setCatalogPage(1);
                            }}
                            placeholder="Search homes, clients, or locations"
                          />
                        </InputGroup>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CatalogFilter
                        label="Clients"
                        options={clients.map(([id, label]) => ({ id, label }))}
                        value={selectedClients}
                        onChange={(value) => {
                          setSelectedClients(value);
                          setCatalogPage(1);
                        }}
                      />
                      <CatalogFilter
                        label="Destinations"
                        options={destinations}
                        value={selectedDestinations}
                        onChange={(value) => {
                          setSelectedDestinations(value);
                          setCatalogPage(1);
                        }}
                      />
                      <CatalogFilter
                        label="Home groups"
                        options={(groups.data ?? [])
                          .filter((group) => group.brandId)
                          .map((group) => ({
                            id: group.id,
                            label: `${clients.find(([id]) => id === group.brandId)?.[1] ?? "Client"} · ${group.name}`,
                          }))}
                        value={selectedGroups}
                        onChange={(value) => {
                          setSelectedGroups(value);
                          setCatalogPage(1);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={
                          !selectedClients.length &&
                          !selectedDestinations.length &&
                          !selectedGroups.length &&
                          !search
                        }
                        onClick={() => {
                          setSelectedClients([]);
                          setSelectedDestinations([]);
                          setSelectedGroups([]);
                          setSearch("");
                          setCatalogPage(1);
                        }}
                      >
                        Clear filters
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          !filteredHomes.length ||
                          busy ||
                          clientCatalog.isPending
                        }
                        onClick={() => {
                          const homeIds = [
                            ...new Set([
                              ...draft.homeIds,
                              ...filteredHomes.map((home) => home.id),
                            ]),
                          ];
                          if (homeIds.length > 1000) {
                            toast.error(
                              "Choose up to 1000 homes per collection.",
                            );
                            return;
                          }
                          setDraft({ ...draft, homeIds });
                        }}
                      >
                        Add all matching homes
                      </Button>
                    </div>
                    {clientCatalog.isPending && (
                      <Text role="status" color="secondary" variant="body-sm">
                        Loading destinations…
                      </Text>
                    )}
                    {clientCatalog.isError && (
                      <div role="alert">
                        <Text>We couldn’t load destinations.</Text>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void clientCatalog.refetch()}
                        >
                          Try again
                        </Button>
                      </div>
                    )}
                    <Text color="secondary" variant="body-sm">
                      Match any choice within a filter, and match each active
                      filter. Changing filters keeps your selected homes.
                    </Text>
                    <Text color="secondary" variant="body-sm">
                      {filteredHomes.length} matching homes ·{" "}
                      {draft.homeIds.length} selected
                    </Text>
                    <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
                      {filteredHomes
                        .slice((catalogPage - 1) * 60, catalogPage * 60)
                        .map((home) => {
                          const selected = draft.homeIds.includes(home.id);
                          return (
                            <label
                              key={home.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-surface-secondary",
                                selected
                                  ? "border-primary bg-surface-secondary"
                                  : "border-border",
                              )}
                            >
                              <Checkbox
                                checked={selected}
                                disabled={
                                  !selected && draft.homeIds.length >= 1000
                                }
                                onCheckedChange={() => toggleHome(home.id)}
                                aria-label={`Select ${home.name}`}
                              />
                              <HomePhoto
                                home={home}
                                className="size-14 shrink-0 rounded-md"
                              />
                              <div className="min-w-0 space-y-1">
                                <Text weight="medium">
                                  <span className="block truncate">
                                    {home.name}
                                  </span>
                                </Text>
                                <Text variant="body-sm" color="secondary">
                                  <span className="block truncate">
                                    {home.brandName}
                                  </span>
                                </Text>
                                <Text variant="body-sm" color="secondary">
                                  <span className="block truncate">
                                    {[home.city, home.state, home.country]
                                      .filter(Boolean)
                                      .join(", ") || "Location not supplied"}
                                  </span>
                                </Text>
                              </div>
                            </label>
                          );
                        })}
                      {!filteredHomes.length && (
                        <div className="p-6 sm:col-span-2">
                          <Text color="secondary">
                            {catalog.data?.length
                              ? "No homes match these filters."
                              : "No eligible client homes yet. Add homes to a client before creating a collection."}
                          </Text>
                        </div>
                      )}
                    </div>
                    {filteredHomes.length > 60 && (
                      <nav
                        aria-label="Catalog pages"
                        className="flex items-center gap-3"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={catalogPage === 1}
                          onClick={() => setCatalogPage(catalogPage - 1)}
                        >
                          Previous
                        </Button>
                        <Text variant="body-sm">
                          Page {catalogPage} of{" "}
                          {Math.ceil(filteredHomes.length / 60)}
                        </Text>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={catalogPage * 60 >= filteredHomes.length}
                          onClick={() => setCatalogPage(catalogPage + 1)}
                        >
                          Next
                        </Button>
                      </nav>
                    )}
                  </section>
                  <section className="space-y-3" aria-label="Selected homes">
                    <div className="flex items-center justify-between gap-2">
                      <Heading as="h3" variant="headline-sm">
                        Your selection
                      </Heading>
                      <Badge variant="secondary">
                        {draft.homeIds.length} / 1000
                      </Badge>
                    </div>
                    <Text color="secondary" variant="body-sm">
                      This order is the order people will see.
                    </Text>
                    <ol className="max-h-96 space-y-2 overflow-y-auto">
                      {draft.homeIds.map((id, index) => {
                        const home = homesById.get(id);
                        return (
                          <li
                            key={id}
                            className="space-y-2 rounded-lg border border-border p-3"
                          >
                            <div className="flex items-center gap-2">
                              <Text variant="body-sm" color="secondary">
                                {index + 1}.
                              </Text>
                              <div className="min-w-0 flex-1">
                                <Text weight="medium">
                                  <span className="block truncate">
                                    {home?.name ?? "Home no longer available"}
                                  </span>
                                </Text>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <Text color="secondary" variant="body-sm">
                                <span className="block truncate">
                                  {home?.brandName ?? "Remove or reload"}
                                </span>
                              </Text>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={index === 0}
                                  aria-label={`Move ${home?.name ?? "home"} up`}
                                  onClick={() => moveHome(index, -1)}
                                >
                                  <ArrowUp className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={index === draft.homeIds.length - 1}
                                  aria-label={`Move ${home?.name ?? "home"} down`}
                                  onClick={() => moveHome(index, 1)}
                                >
                                  <ArrowDown className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${home?.name ?? "home"}`}
                                  onClick={() => toggleHome(id)}
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {!draft.homeIds.length && (
                        <li className="rounded-lg border border-dashed border-border p-6">
                          <Text color="secondary" variant="body-long">
                            Select homes from the catalog to build your
                            shortlist.
                          </Text>
                        </li>
                      )}
                    </ol>
                  </section>
                </fieldset>
              </fieldset>
              {error && (
                <div
                  role="alert"
                  className="space-y-3 rounded-lg border border-destructive p-4"
                >
                  <Text>{error}</Text>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void catalog.refetch()}
                    >
                      Refresh available homes
                    </Button>
                    {draft.id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void reloadSavedDraft()}
                      >
                        Load saved version (discard draft)
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Text color="secondary" variant="body-sm">
                  {draft.id
                    ? "Edits update the shared page. Revoked links stay revoked."
                    : "Saving creates an unlisted link, ready to copy."}
                </Text>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={closeEditor}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      busy ||
                      !draft.title.trim() ||
                      !draft.homeIds.length ||
                      draft.homeIds.some((id) => !homesById.has(id))
                    }
                  >
                    {save.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {save.isPending ? "Saving…" : "Save collection"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "amplifier"
                ? `Delete ${deleteTarget.contact.name}?`
                : deleteTarget?.collection.brandId
                  ? "Remove this shared group?"
                  : "Delete this collection?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "amplifier"
                ? "This removes the contact from the amplifier directory. Existing partnerships, collections and attribution history are kept. No brand workspace or homes are deleted."
                : deleteTarget?.collection.brandId
                  ? "This disables the share link and removes its sharing settings. The client’s original home group and its homes are kept."
                  : "This permanently deletes the collection and its selected-home list. Its link stops working. Homes, contacts and partnerships are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <Text role="alert">{deleteError}</Text>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                if (deleteTarget.kind === "amplifier")
                  removeAmplifier.mutate({ id: deleteTarget.contact.id });
                else
                  removeCollection.mutate({
                    id: deleteTarget.collection.id,
                    expectedRevision: deleteTarget.collection.revision,
                  });
              }}
            >
              {busy
                ? "Deleting…"
                : deleteTarget?.kind === "collection" &&
                    deleteTarget.collection.brandId
                  ? "Remove share"
                  : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your edits?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved title and selection will be lost. The saved
              collection will not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => setDraft(null)}>
              Discard edits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={linkAction !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setLinkAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {linkAction?.kind === "revoke"
                ? "Revoke this link?"
                : "Create a new share link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {linkAction?.kind === "revoke"
                ? "Anyone using the current link will lose access. Your collection and selection are kept. Saving edits will not reactivate this link."
                : "This makes the title and selected homes public to anyone with the new link. Previously revoked links will remain invalid."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (!linkAction) return;
                const input = {
                  id: linkAction.collection.id,
                  expectedRevision: linkAction.collection.revision,
                };
                if (linkAction.kind === "revoke") revoke.mutate(input);
                else renew.mutate(input);
              }}
            >
              {busy
                ? "Updating…"
                : linkAction?.kind === "revoke"
                  ? "Revoke link"
                  : "Create new link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={copyFallback !== null}
        onOpenChange={(open) => {
          if (!open) setCopyFallback(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy share link</DialogTitle>
            <DialogDescription>
              Clipboard access is unavailable. Select and copy this link
              manually.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Share link"
            readOnly
            value={copyFallback ?? ""}
            onFocus={(event) => event.target.select()}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
