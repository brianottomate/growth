"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/trpc/react";

export type BrandLite = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website: string | null;
  logo: string | null;
};

export function BrandActions({ brand }: { brand: BrandLite }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: brand.name,
    tagline: brand.tagline ?? "",
    description: brand.description ?? "",
    website: brand.website ?? "",
    logo: brand.logo ?? "",
  });

  const refresh = () => router.refresh();
  const enrichM = useMutation(
    trpc.brand.enrich.mutationOptions({ onSuccess: refresh }),
  );
  const updateM = useMutation(
    trpc.brand.update.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        refresh();
      },
    }),
  );
  const deleteM = useMutation(
    trpc.brand.delete.mutationOptions({ onSuccess: refresh }),
  );

  const onDelete = () => {
    if (confirm(`Delete ${brand.name}? This removes it from your brands.`)) {
      deleteM.mutate({ id: brand.id });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            disabled={enrichM.isPending || deleteM.isPending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!brand.website || enrichM.isPending}
            onClick={() => enrichM.mutate({ id: brand.id })}
          >
            <Sparkles className="size-3.5" />
            {enrichM.isPending ? "Enriching…" : "Enrich from website"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit brand</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tagline</Label>
              <Input
                value={form.tagline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tagline: e.target.value }))
                }
                placeholder="Luxury travel marketplace"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) =>
                  setForm((f) => ({ ...f, website: e.target.value }))
                }
                placeholder="wander.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Logo URL</Label>
              <Input
                value={form.logo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, logo: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
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
    </>
  );
}
