"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function MediaTaxonomyDialog({
  brandId,
  open,
  onOpenChange,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const taxonomyOptions = orpc.media.taxonomy.queryOptions({
    input: { brandId },
  });
  const { data } = useQuery(taxonomyOptions);
  const [folderName, setFolderName] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taxonomyOptions.queryKey }),
      queryClient.invalidateQueries({
        queryKey: orpc.media.list.queryOptions({ input: { brandId } }).queryKey,
      }),
    ]);
  };

  const createFolder = useMutation(
    orpc.media.createFolder.mutationOptions({
      onSuccess: async () => {
        setFolderName("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const deleteFolder = useMutation(
    orpc.media.deleteFolder.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    }),
  );
  const createTag = useMutation(
    orpc.media.createTag.mutationOptions({
      onSuccess: async () => {
        setTagName("");
        setTagDescription("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const deleteTag = useMutation(
    orpc.media.deleteTag.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Organize media</DialogTitle>
          <DialogDescription>
            Folders organize the library. Managed tags are the vocabulary both
            you and on-demand AI analysis can apply.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="folders">
          <TabsList>
            <TabsTrigger value="folders">Folders</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && folderName.trim())
                    createFolder.mutate({ brandId, name: folderName.trim() });
                }}
                placeholder="Brand kit, Launches, UGC…"
              />
              <Button
                onClick={() =>
                  createFolder.mutate({ brandId, name: folderName.trim() })
                }
                disabled={!folderName.trim()}
                loading={createFolder.isPending}
              >
                <FolderPlus className="size-4" /> Add
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {data?.folders.length ? (
                data.folders.map((folder) => (
                  <div key={folder.id} className="flex items-center px-3 py-2">
                    <span className="text-sm font-medium">{folder.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      tone="muted"
                      className="ml-auto size-7"
                      title={`Delete ${folder.name}`}
                      onClick={() => deleteFolder.mutate({ id: folder.id })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  No folders yet.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tags" className="space-y-4 pt-2">
            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label>Tag name</Label>
                <Input
                  value={tagName}
                  onChange={(event) => setTagName(event.target.value)}
                  placeholder="Logo, founder, product screenshot…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Description for AI</Label>
                <Input
                  value={tagDescription}
                  onChange={(event) => setTagDescription(event.target.value)}
                  placeholder="When should this tag be applied?"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && tagName.trim())
                      createTag.mutate({
                        brandId,
                        name: tagName.trim(),
                        description: tagDescription.trim() || undefined,
                      });
                  }}
                />
              </div>
              <Button
                className="justify-self-end"
                onClick={() =>
                  createTag.mutate({
                    brandId,
                    name: tagName.trim(),
                    description: tagDescription.trim() || undefined,
                  })
                }
                disabled={!tagName.trim()}
                loading={createTag.isPending}
              >
                <Tags className="size-4" /> Add tag
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {data?.tags.length ? (
                data.tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-start gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{tag.name}</p>
                      {tag.description && (
                        <p className="text-xs text-muted-foreground">
                          {tag.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      tone="muted"
                      className="ml-auto size-7 shrink-0"
                      title={`Delete ${tag.name}`}
                      onClick={() => deleteTag.mutate({ id: tag.id })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  No managed tags yet. AI analysis will leave tags empty until
                  you create some.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
