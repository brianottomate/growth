"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Folder,
  FolderDown,
  Loader2,
  Search,
} from "lucide-react";

import { authClient } from "@/server/better-auth/client";
import { DRIVE_READONLY_SCOPE, isDriveFolder } from "@/lib/google-drive";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";
import type { MediaAsset } from "@/server/db/schema";

type Crumb = { id: string; name: string };

/**
 * Pull creative straight out of Drive.
 *
 * "Connect" is an incremental-consent re-link of the Google account the user
 * already signed in with, so there's no separate account to manage — Growth
 * just asks for one more scope. Selected files are rehosted into R2 (Drive
 * URLs need the viewer's own credentials, so linking them would break for
 * everyone else).
 */
export function GoogleDriveImportDialog({
  brandId,
  open,
  onOpenChange,
  onImported,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (assets: MediaAsset[]) => void | Promise<void>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const folderId = crumbs.at(-1)?.id;
  const status = useQuery({
    ...trpc.googleDrive.status.queryOptions(),
    enabled: open,
  });
  const files = useQuery({
    ...trpc.googleDrive.browse.queryOptions({
      ...(folderId ? { folderId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      includeFolders: true,
      limit: 100,
    }),
    enabled: open && Boolean(status.data?.connected),
  });

  const importFiles = useMutation(
    trpc.googleDrive.importFiles.mutationOptions({
      onSuccess: async (result) => {
        if (result.failures.length) {
          toast.error(
            `${result.failures.length} file${result.failures.length === 1 ? "" : "s"} could not be imported.`,
          );
        }
        if (result.imported) {
          toast.success(
            `Imported ${result.imported} image${result.imported === 1 ? "" : "s"} from Drive.`,
          );
          await onImported?.(result.assets);
          await queryClient.invalidateQueries();
        }
        setSelected([]);
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // Full-page redirect — an OAuth consent screen can't run inside fetch().
  const connect = () =>
    authClient.linkSocial({
      provider: "google",
      scopes: [DRIVE_READONLY_SCOPE],
      callbackURL: window.location.pathname,
    });

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  const rows = files.data ?? [];
  const busy = importFiles.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Google Drive</DialogTitle>
        </DialogHeader>

        {status.isLoading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Checking Drive access…
          </p>
        ) : !status.data?.configured ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Google Drive isn’t configured in this environment yet.
          </p>
        ) : !status.data.connected ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm">
              Growth needs read-only access to your Drive to pull creative in.
            </p>
            <p className="text-muted-foreground text-xs">
              It only reads — nothing is ever written back to Drive.
            </p>
            <Button onClick={() => void connect()}>Connect Google Drive</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your Drive"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCrumbs([])}
                className="hover:text-foreground"
              >
                My Drive
              </button>
              {crumbs.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3" />
                  <button
                    type="button"
                    onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
                    className="hover:text-foreground"
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border">
              {files.isLoading ? (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  Loading Drive…
                </p>
              ) : files.error ? (
                <p className="text-destructive p-6 text-center text-sm">
                  {files.error.message}
                </p>
              ) : !rows.length ? (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  No images here.
                </p>
              ) : (
                rows.map((file) => {
                  const isFolder = isDriveFolder(file);
                  const checked = selected.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() =>
                        isFolder
                          ? (setCrumbs([
                              ...crumbs,
                              { id: file.id, name: file.name },
                            ]),
                            setSearch(""))
                          : toggle(file.id)
                      }
                      className={cn(
                        "hover:bg-accent/40 flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0",
                        checked && "bg-accent/60",
                      )}
                    >
                      {isFolder ? (
                        <Folder className="size-4 shrink-0" />
                      ) : (
                        <span
                          className={cn(
                            "size-4 shrink-0 rounded border",
                            checked && "bg-primary border-primary",
                          )}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {file.name}
                      </span>
                      {isFolder && (
                        <ChevronRight className="text-muted-foreground size-4" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <DialogFooter className="items-center sm:justify-between">
              <span className="text-muted-foreground text-xs">
                {selected.length
                  ? `${selected.length} selected · imported in this order`
                  : "Select images, or open a folder"}
              </span>
              <Button
                disabled={!selected.length || busy}
                onClick={() =>
                  importFiles.mutate({ brandId, fileIds: selected })
                }
              >
                {busy ? <Loader2 className="animate-spin" /> : <FolderDown />}
                Import {selected.length || ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
