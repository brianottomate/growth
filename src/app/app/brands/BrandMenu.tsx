"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  Handshake,
  HardDriveDownload,
  Link2,
  MoreHorizontal,
  Pencil,
  PlugZap,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import type { BrandLink } from "@/server/db/brand-schema";
import { BrandLinksDialog } from "./BrandLinks";
import { ZernioConnectDialog } from "./ZernioConnection";

export type BrandLite = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website: string | null;
  logo: string | null;
  relationship: "internal" | "client" | "prospect" | "reference";
};

type DialogKind = "edit" | "zernio" | "links" | null;

/**
 * The card's one menu. Everything that used to be a row of ghost buttons —
 * connect Zernio, sync history, discover profiles, links, enrich, edit — lives
 * here, so the card itself stays a read. Dialogs are siblings of the menu and
 * open on the next tick so Radix can close the menu first.
 */
export function BrandMenu({
  brand,
  zernioProfileId,
  links,
}: {
  brand: BrandLite;
  zernioProfileId: string | null;
  links: BrandLink[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const openDialog = (kind: DialogKind) => setTimeout(() => setDialog(kind), 0);
  const refresh = () => router.refresh();

  const discoverM = useMutation(
    trpc.channelSuggestion.discover.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          r.discovered === 0
            ? "No new profiles found"
            : `${r.discovered} profile${r.discovered === 1 ? "" : "s"} found — review them under Channels`,
        );
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const syncM = useMutation(
    trpc.zernio.syncHistory.mutationOptions({
      onSuccess: (r) => {
        toast.success(`History synced · ${r.inserted} new, ${r.updated} refreshed`);
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const cacheMediaM = useMutation(
    trpc.media.cacheBrandPostMedia.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          `Media cached · ${r.cached} file${r.cached === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} unavailable` : ""}`,
        );
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const refreshIgM = useMutation(
    trpc.media.refreshOwnedInstagramMedia.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          `Instagram refreshed · ${r.updatedExisting} posts updated · ${r.cached} files cached`,
        );
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const enrichM = useMutation(
    trpc.brand.enrich.mutationOptions({
      onSuccess: () => {
        toast.success("Enriched from website");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const promoteM = useMutation(
    trpc.performance.promoteToClient.mutationOptions({
      onSuccess: refresh,
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteM = useMutation(
    trpc.brand.delete.mutationOptions({ onSuccess: refresh }),
  );

  const busy =
    discoverM.isPending ||
    syncM.isPending ||
    cacheMediaM.isPending ||
    refreshIgM.isPending ||
    enrichM.isPending;

  const onDelete = () => {
    if (confirm(`Delete ${brand.name}? This removes it from your brands.`)) {
      deleteM.mutate({ id: brand.id });
    }
  };

  const linked = links.filter((l) => l.url);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7"
            loading={busy}
            disabled={deleteM.isPending}
            aria-label="Brand actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            Channels
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={discoverM.isPending}
            onSelect={() => discoverM.mutate({ brandId: brand.id })}
          >
            <Search className="size-3.5" />
            {discoverM.isPending ? "Searching…" : "Find public profiles"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog("zernio")}>
            {zernioProfileId ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <PlugZap className="size-3.5" />
            )}
            {zernioProfileId ? "Refresh Zernio accounts" : "Connect Zernio"}
          </DropdownMenuItem>
          {zernioProfileId && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={syncM.isPending}>
                  <Download className="size-3.5" />
                  {syncM.isPending ? "Syncing history…" : "Sync owned history"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {[3, 6, 12].map((monthsBack) => (
                    <DropdownMenuItem
                      key={monthsBack}
                      onSelect={() =>
                        syncM.mutate({ brandId: brand.id, monthsBack })
                      }
                    >
                      Last {monthsBack} months
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                disabled={cacheMediaM.isPending}
                onSelect={() => cacheMediaM.mutate({ brandId: brand.id })}
              >
                <HardDriveDownload className="size-3.5" />
                Cache post media
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={refreshIgM.isPending}
                onSelect={() => refreshIgM.mutate({ brandId: brand.id })}
              >
                <RefreshCw className="size-3.5" />
                Refresh Instagram media
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            Links
          </DropdownMenuLabel>
          {linked.map((l) => (
            <DropdownMenuItem key={l.url} asChild>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                {l.label}
              </a>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => openDialog("links")}>
            <Link2 className="size-3.5" />
            {links.length ? "Manage links…" : "Add a link…"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!brand.website || enrichM.isPending}
            onSelect={() => enrichM.mutate({ id: brand.id })}
          >
            <Sparkles className="size-3.5" />
            {enrichM.isPending ? "Enriching…" : "Enrich from website"}
          </DropdownMenuItem>
          {brand.relationship !== "client" && (
            <DropdownMenuItem
              disabled={promoteM.isPending}
              onSelect={() => promoteM.mutate({ brandId: brand.id })}
            >
              <Handshake className="size-3.5" />
              {promoteM.isPending ? "Marking…" : "Mark as client"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => openDialog("edit")}>
            <Pencil className="size-3.5" />
            Edit brand
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditBrandDialog
        brand={brand}
        open={dialog === "edit"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ZernioConnectDialog
        brandId={brand.id}
        currentProfileId={zernioProfileId}
        open={dialog === "zernio"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <BrandLinksDialog
        brandId={brand.id}
        links={links}
        open={dialog === "links"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </>
  );
}

function EditBrandDialog({
  brand,
  open,
  onOpenChange,
}: {
  brand: BrandLite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [form, setForm] = useState({
    name: brand.name,
    tagline: brand.tagline ?? "",
    description: brand.description ?? "",
    website: brand.website ?? "",
    logo: brand.logo ?? "",
  });
  const updateM = useMutation(
    trpc.brand.update.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const field =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit brand</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={field("name")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tagline</Label>
            <Input
              value={form.tagline}
              onChange={field("tagline")}
              placeholder="Luxury vacation rentals in Winter Park, Colorado."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={field("description")}
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Website</Label>
            <Input
              value={form.website}
              onChange={field("website")}
              placeholder="wander.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Logo URL</Label>
            <Input value={form.logo} onChange={field("logo")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={updateM.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            loading={updateM.isPending}
            disabled={!form.name.trim()}
            onClick={() => updateM.mutate({ id: brand.id, ...form })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
